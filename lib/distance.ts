// Cumulative distance (km) per sample — a pure, testable helper.
//
// The old inline `cumDist += speed / 3600` assumed exactly one second per row and treated mph as
// km/h, so a 10 Hz log reported ~10× its true distance and mph logs were mislabelled. This module
// integrates speed over the ACTUAL per-sample time (trapezoidally) and normalises units.
//
// Policy:
//  • A real, USABLE Trip Distance channel wins: sum its forward increments (resets/baseline-shifts
//    are skipped), converted to km. Exact, not approximate. But an all-zero / constant / mostly
//    missing counter is NOT usable — it must not override a valid speed/time integration and report
//    zero distance for a real drive (see classifyTripDistance).
//  • Otherwise, with trustworthy timestamps, integrate speed (km/h) over real Δt. Segments whose
//    Δt exceeds DISTANCE_GAP_SECONDS are recording gaps: what happened is unknown, so they add
//    nothing rather than inventing phantom distance.
//  • Without trustworthy time and without a usable trip channel, distance is UNAVAILABLE (we refuse
//    to guess a cadence and report, e.g., 10× the real value). Callers disable distance mode.

const MPH_TO_KMH = 1.609344
const MI_TO_KM = 1.609344
/** Δt above this (seconds) is treated as a recording gap and contributes no integrated distance. */
export const DISTANCE_GAP_SECONDS = 5
/** A trip counter must carry a finite value on at least this fraction of samples to be usable. */
export const MIN_TRIP_COVERAGE = 0.5
/** Cumulative distance at/below this (km) counts as "no meaningful travel". */
export const MOVEMENT_EPSILON_KM = 0.05
/** A speed sample above this (in the log's own unit) counts as the vehicle actually moving. */
export const MOVEMENT_SPEED_EPS = 1

export type DistanceSource = "trip" | "integrated" | "none"

export interface DistanceResult {
  /** Cumulative kilometres at each sample. All zeros when unavailable. */
  dist: number[]
  available: boolean
  approximate: boolean
  source: DistanceSource
}

export interface DistanceInput {
  /** Speed per sample, in `speedUnit`. */
  speeds: number[]
  speedUnit: "km/h" | "mph"
  /** Elapsed seconds per sample (from the trusted time axis); required for integration. */
  elapsed: number[]
  trustedTime: boolean
  /** Optional raw Trip Distance channel values (in `tripDistanceUnit`). */
  tripDistance?: (number | undefined | null)[]
  tripDistanceUnit?: string
}

function tripUnitToKm(unit: string | undefined): number {
  if (!unit) return 1
  return /^(mi|mile)/i.test(unit.trim()) ? MI_TO_KM : 1
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

// Cumulative km from a trip-distance counter, plus the metadata needed to judge whether the counter
// is trustworthy: how much of the log it covers and how much forward travel it actually recorded.
function tripCumulative(
  tripDistance: (number | undefined | null)[],
  k: number,
  n: number,
): { dist: number[]; totalKm: number; coverage: number } {
  const dist: number[] = []
  let cum = 0
  let prev: number | null = null
  let finite = 0
  for (let i = 0; i < n; i++) {
    const raw = tripDistance[i]
    const isNum = typeof raw === "number" && !isNaN(raw)
    if (isNum) finite++
    const v: number = isNum ? (raw as number) : prev ?? 0
    if (prev !== null) {
      const delta = v - prev
      // Small forward increments are real travel; negative deltas are counter resets and large
      // jumps are baseline shifts — both re-baseline without adding distance.
      if (delta >= 0 && delta < 2) cum += delta * k
    }
    prev = v
    dist.push(round3(cum))
  }
  return { dist, totalKm: cum, coverage: n > 0 ? finite / n : 0 }
}

function integrate(speeds: number[], toKmh: number, elapsed: number[], n: number): number[] {
  const dist: number[] = [0]
  let cum = 0
  for (let i = 1; i < n; i++) {
    const dt = elapsed[i] - elapsed[i - 1]
    if (dt > 0 && dt <= DISTANCE_GAP_SECONDS) {
      const v0 = (speeds[i - 1] || 0) * toKmh // km/h
      const v1 = (speeds[i] || 0) * toKmh
      cum += ((v0 + v1) / 2) * (dt / 3600) // trapezoidal: (km/h) * hours = km
    }
    dist.push(round3(cum))
  }
  return dist
}

export type TripUsability = "usable" | "no-travel" | "too-sparse"

/**
 * Classify a trip-distance counter independently of the speed integration.
 *  • "usable"      — covers enough of the log AND recorded meaningful forward travel.
 *  • "no-travel"   — covers the log but recorded ~no forward travel (all-zero / constant counter).
 *                    Only trustworthy if the vehicle was genuinely stationary.
 *  • "too-sparse"  — missing on too many samples to trust as an authoritative total.
 */
export function classifyTripDistance(totalKm: number, coverage: number): TripUsability {
  if (coverage < MIN_TRIP_COVERAGE) return "too-sparse"
  if (totalKm <= MOVEMENT_EPSILON_KM) return "no-travel"
  return "usable"
}

export function computeCumulativeDistanceKm(input: DistanceInput): DistanceResult {
  const { speeds, speedUnit, elapsed, trustedTime, tripDistance, tripDistanceUnit } = input
  const n = speeds.length
  const zero = () => new Array<number>(n).fill(0)

  // Two independent facts about the log:
  //  • distance INTEGRABLE — a trustworthy clock aligned to the samples lets us compute an exact
  //    trapezoidal fallback distance;
  //  • movement OBSERVED — the speed trace itself contains meaningful positive samples, which proves
  //    the vehicle was not stationary even when we can't quantify how far it went.
  const canIntegrate = trustedTime && elapsed.length === n && n > 0
  const integrated = canIntegrate ? integrate(speeds, speedUnit === "mph" ? MPH_TO_KMH : 1, elapsed, n) : null
  const integratedKm = integrated ? integrated[integrated.length - 1] : 0
  const integrationMoved = integrated != null && integratedKm > MOVEMENT_EPSILON_KM
  const movementObserved = speeds.some((s) => Number.isFinite(s) && s > MOVEMENT_SPEED_EPS)

  // --- Trip Distance channel (authoritative only when usable) --------------
  const hasTrip = Array.isArray(tripDistance) && tripDistance.some((v) => typeof v === "number" && !isNaN(v))
  if (hasTrip) {
    const trip = tripCumulative(tripDistance!, tripUnitToKm(tripDistanceUnit), n)
    const usability = classifyTripDistance(trip.totalKm, trip.coverage)

    if (usability === "usable") {
      return { dist: trip.dist, available: true, approximate: false, source: "trip" }
    }
    // Counter recorded ~no travel, or is too sparse. If integration shows the vehicle actually
    // moved, the counter is stuck/unusable — prefer the integration rather than reporting zero.
    if (integrationMoved) {
      return { dist: integrated!, available: true, approximate: true, source: "integrated" }
    }
    // The counter can't be trusted and there is no integrable fallback. If the speed trace shows the
    // vehicle actually moved, a stuck/constant counter must NOT be reported as an authoritative 0 km —
    // we simply can't quantify the distance, so it is unavailable.
    if (movementObserved) {
      return { dist: zero(), available: false, approximate: false, source: "none" }
    }
    if (usability === "no-travel") {
      // Counter shows no travel AND the speed trace shows no movement → a genuinely stationary
      // vehicle with a constant/zero trip counter. A zero-distance trip is correct and available.
      return { dist: trip.dist, available: true, approximate: false, source: "trip" }
    }
    // Too sparse and nothing better available → refuse to invent a false total.
    return { dist: zero(), available: false, approximate: false, source: "none" }
  }

  // --- Integrate speed over real time --------------------------------------
  if (integrated) {
    return { dist: integrated, available: true, approximate: true, source: "integrated" }
  }
  // No trip channel and no trustworthy clock → refuse to guess (would risk a 10× error).
  return { dist: zero(), available: false, approximate: false, source: "none" }
}
