// Pure GPS helpers shared by the route map and data-health. Kept free of DOM/canvas so the numeric
// behaviour (valid-fix filtering, bounds, degenerate-track detection, speed-gradient range, coverage
// classification) can be unit-tested directly.
//
// Speed values here are whatever unit the log records (km/h or mph). These helpers never convert —
// they operate on the raw numbers and the caller labels them with the log's unit — so the same log
// yields the same gradient range regardless of unit.
import { safeMax, safeMin } from "@/lib/stats"

export interface GpsSample {
  latitude?: number | null
  longitude?: number | null
  speed?: number | null
}

/**
 * A usable location fix. (0,0) is the "no fix" sentinel and is rejected; a finite point on the
 * equator or prime meridian alone is still valid. Non-finite / missing coords are rejected.
 */
export function isValidGpsFix(d: GpsSample): boolean {
  return (
    Number.isFinite(d.latitude as number) &&
    Number.isFinite(d.longitude as number) &&
    !(d.latitude === 0 && d.longitude === 0)
  )
}

export function filterGpsFixes<T extends GpsSample>(data: T[]): T[] {
  return data.filter(isValidGpsFix)
}

export type GpsCoverage = "none" | "sparse" | "ok"

/** Classify how much of a log carries a location fix. Sparse below `minFraction` (default 50%). */
export function classifyGpsCoverage(fixes: number, total: number, minFraction = 0.5): GpsCoverage {
  if (fixes === 0 || total === 0) return "none"
  return fixes < total * minFraction ? "sparse" : "ok"
}

export interface GpsBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** Bounding box of the valid fixes, or null when there are none. */
export function gpsBounds(points: GpsSample[]): GpsBounds | null {
  const fixes = filterGpsFixes(points)
  if (fixes.length === 0) return null
  const lats = fixes.map((d) => d.latitude as number)
  const lngs = fixes.map((d) => d.longitude as number)
  return { minLat: safeMin(lats), maxLat: safeMax(lats), minLng: safeMin(lngs), maxLng: safeMax(lngs) }
}

/** Approximate diagonal of the track's bounding box, in metres (equirectangular near the mean lat). */
export function trackDiagonalMetres(bounds: GpsBounds): number {
  const meanLat = (bounds.minLat + bounds.maxLat) / 2
  const kx = Math.cos((meanLat * Math.PI) / 180) || 1
  return Math.hypot((bounds.maxLng - bounds.minLng) * kx, bounds.maxLat - bounds.minLat) * 111_320
}

/**
 * A track is "degenerate" (stationary / a single fix) when every point sits within `thresholdM`
 * metres — there is no path to draw. No valid fixes also counts as degenerate.
 */
export function isDegenerateTrack(points: GpsSample[], thresholdM = 20): boolean {
  const bounds = gpsBounds(points)
  if (!bounds) return true
  return trackDiagonalMetres(bounds) < thresholdM
}

export interface SpeedRange {
  min: number
  max: number
  /** True when the speed values vary enough to justify a colour gradient. */
  varies: boolean
  /** How many valid fixes actually carried a finite speed value. */
  finiteCount: number
}

/**
 * Min/max speed across the valid fixes, considering only FINITE speed values — a missing speed is
 * UNKNOWN, not zero, so it never drags the legend down to 0 or paints a fix as "stopped". The
 * numbers are in the log's own speed unit — no conversion is applied. `varies` is false (and the
 * caller should draw a neutral track) when fewer than two finite speeds exist or they don't differ.
 */
export function gpsSpeedRange(points: GpsSample[], epsilon = 0.001): SpeedRange {
  const fixes = filterGpsFixes(points)
  const speeds = fixes.map((d) => d.speed).filter((s): s is number => Number.isFinite(s as number))
  if (speeds.length === 0) return { min: 0, max: 0, varies: false, finiteCount: 0 }
  const min = safeMin(speeds)
  const max = safeMax(speeds)
  return { min, max, varies: speeds.length >= 2 && max - min > epsilon, finiteCount: speeds.length }
}

/**
 * Index (into `fixes`, assumed chronological by `time`) of the most recent valid fix at or before
 * `currentTime`, or -1 when playback is before the first fix. This is the marker policy for sparse
 * GPS: hold the last known position rather than jumping forward to a future fix.
 */
export function activeGpsFixIndex<T extends GpsSample & { time?: number }>(fixes: T[], currentTime: number): number {
  let idx = -1
  for (let i = 0; i < fixes.length; i++) {
    const t = fixes[i].time ?? i
    if (t <= currentTime) idx = i
    else break
  }
  return idx
}
