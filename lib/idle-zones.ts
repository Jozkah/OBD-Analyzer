// Idle-zone detection, kept pure and — crucially — computed from the FULL (non-downsampled) sample
// series. If idle intervals were derived from the already-downsampled chart data, a short idle
// period sitting between two retained points could vanish or have its boundaries shifted. The
// caller renders the returned bands as ReferenceAreas, so the bounds are expressed in whatever
// x-domain the chart plots (elapsed seconds when timestamps are trusted, else sample index).
import type { DataPoint } from "@/types/obd"

export interface IdleZone {
  x1: number
  x2: number
}

/**
 * Contiguous runs where speed is 0, as [x1, x2] bands in the `xKey` domain.
 * A run that reaches the end of the data closes at the last sample's x.
 */
export function computeIdleZones(points: DataPoint[], xKey: string): IdleZone[] {
  if (points.length === 0) return []
  const xOf = (p: DataPoint) => (p[xKey] as number) ?? p.time
  const zones: IdleZone[] = []
  let zoneStart: number | null = null
  for (let i = 0; i < points.length; i++) {
    const isIdle = (points[i].speed || 0) === 0
    if (isIdle && zoneStart === null) {
      zoneStart = xOf(points[i])
    } else if (!isIdle && zoneStart !== null) {
      zones.push({ x1: zoneStart, x2: xOf(points[i]) })
      zoneStart = null
    }
  }
  if (zoneStart !== null) {
    zones.push({ x1: zoneStart, x2: xOf(points[points.length - 1]) })
  }
  return zones
}
