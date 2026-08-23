// Derived session metadata for the post-import Session Summary.
//
// This intentionally computes only NEW metadata (timing, sampling rate, channel ranges,
// presence flags). Headline max/avg speed & RPM and trip totals keep coming from the existing
// memoised `stats`/`tripTotals` in the app so this module never diverges from — or silently
// re-implements — the established telemetry math.

import type { DataPoint } from "@/types/obd"
import { computeTimeAxis, type TimeAxis } from "@/lib/elapsed-time"

export interface Range {
  min: number
  max: number
}

export interface SessionMeta {
  sampleCount: number
  timeAxis: TimeAxis
  durationSeconds: number | null
  /** Effective sampling rate (samples per second) when duration is trustworthy. */
  effectiveHz: number | null
  coolantRange: Range | null
  intakeRange: Range | null
  /** GPS fixes: finite lat/lng excluding the (0,0) no-fix sentinel — matches the map's count. */
  gpsPointCount: number
  hasGps: boolean
}

/** Min/max over finite numeric values of a channel, or null when the channel is absent/empty. */
export function rangeOf(data: DataPoint[], key: string): Range | null {
  let min = Infinity
  let max = -Infinity
  let seen = false
  for (const d of data) {
    const v = (d as Record<string, unknown>)[key]
    if (typeof v === "number" && Number.isFinite(v)) {
      seen = true
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  return seen ? { min, max } : null
}

export function countGpsFixes(data: DataPoint[]): number {
  return data.filter(
    (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
  ).length
}

export function computeSessionMeta(data: DataPoint[]): SessionMeta {
  const sampleCount = data.length
  const timeAxis = computeTimeAxis(data.map((d) => d.timestamp))
  const durationSeconds = timeAxis.totalSeconds
  const effectiveHz =
    durationSeconds != null && durationSeconds > 0 ? sampleCount / durationSeconds : null
  const gpsPointCount = countGpsFixes(data)

  return {
    sampleCount,
    timeAxis,
    durationSeconds,
    effectiveHz,
    coolantRange: rangeOf(data, "coolantTemp"),
    intakeRange: rangeOf(data, "intakeTemp"),
    gpsPointCount,
    hasGps: gpsPointCount > 0,
  }
}
