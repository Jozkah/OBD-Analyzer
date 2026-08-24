// Cumulative distance (km) per sample — a pure, testable helper.
//
// The old inline `cumDist += speed / 3600` assumed exactly one second per row and treated mph as
// km/h, so a 10 Hz log reported ~10× its true distance and mph logs were mislabelled. This module
// integrates speed over the ACTUAL per-sample time (trapezoidally) and normalises units.
//
// Policy:
//  • A real Trip Distance channel wins: sum its forward increments (resets/baseline-shifts are
//    skipped), converted to km. Exact, not approximate.
//  • Otherwise, with trustworthy timestamps, integrate speed (km/h) over real Δt. Segments whose
//    Δt exceeds DISTANCE_GAP_SECONDS are recording gaps: what happened is unknown, so they add
//    nothing rather than inventing phantom distance.
//  • Without trustworthy time and without a trip channel, distance is UNAVAILABLE (we refuse to
//    guess a cadence and report, e.g., 10× the real value). Callers disable distance mode.

const MPH_TO_KMH = 1.609344
const MI_TO_KM = 1.609344
/** Δt above this (seconds) is treated as a recording gap and contributes no integrated distance. */
export const DISTANCE_GAP_SECONDS = 5

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

export function computeCumulativeDistanceKm(input: DistanceInput): DistanceResult {
  const { speeds, speedUnit, elapsed, trustedTime, tripDistance, tripDistanceUnit } = input
  const n = speeds.length
  const zero = () => new Array<number>(n).fill(0)

  // --- Trip Distance channel (authoritative when present) ------------------
  const hasTrip = Array.isArray(tripDistance) && tripDistance.some((v) => typeof v === "number" && !isNaN(v as number))
  if (hasTrip) {
    const k = tripUnitToKm(tripDistanceUnit)
    const dist: number[] = []
    let cum = 0
    let prev: number | null = null
    for (let i = 0; i < n; i++) {
      const raw = tripDistance![i]
      const v: number = typeof raw === "number" && !isNaN(raw) ? raw : prev ?? 0
      if (prev !== null) {
        const delta = v - prev
        // Small forward increments are real travel; negative deltas are counter resets and large
        // jumps are baseline shifts — both re-baseline without adding distance.
        if (delta >= 0 && delta < 2) cum += delta * k
      }
      prev = v
      dist.push(Math.round(cum * 1000) / 1000)
    }
    return { dist, available: true, approximate: false, source: "trip" }
  }

  // --- Integrate speed over real time --------------------------------------
  if (!trustedTime || elapsed.length !== n) {
    // No trip channel and no trustworthy clock → refuse to guess (would risk a 10× error).
    return { dist: zero(), available: false, approximate: false, source: "none" }
  }

  const toKmh = speedUnit === "mph" ? MPH_TO_KMH : 1
  const dist: number[] = [0]
  let cum = 0
  for (let i = 1; i < n; i++) {
    const dt = elapsed[i] - elapsed[i - 1]
    if (dt > 0 && dt <= DISTANCE_GAP_SECONDS) {
      const v0 = (speeds[i - 1] || 0) * toKmh // km/h
      const v1 = (speeds[i] || 0) * toKmh
      cum += ((v0 + v1) / 2) * (dt / 3600) // trapezoidal: (km/h) * hours = km
    }
    dist.push(Math.round(cum * 1000) / 1000)
  }
  return { dist, available: true, approximate: false, source: "integrated" }
}
