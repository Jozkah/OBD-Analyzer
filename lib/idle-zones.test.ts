import { describe, it, expect } from "vitest"
import { computeIdleZones } from "./idle-zones"
import { lttbDownsample } from "./downsample"
import type { DataPoint } from "@/types/obd"

function row(i: number, speed: number, elapsed: number): DataPoint {
  return { time: i, timestamp: "", rpm: speed * 30, speed, throttle: 0, brake: 0, boost: 0, coolantTemp: 0, intakeTemp: 0, fuelRate: 0, elapsed } as DataPoint
}

describe("computeIdleZones", () => {
  it("returns a band for a contiguous idle run in the elapsed domain", () => {
    const pts = [row(0, 30, 0), row(1, 0, 1), row(2, 0, 2), row(3, 40, 3)]
    expect(computeIdleZones(pts, "elapsed")).toEqual([{ x1: 1, x2: 3 }])
  })

  it("closes an idle run that reaches the end of the data", () => {
    const pts = [row(0, 30, 0), row(1, 0, 1), row(2, 0, 2)]
    expect(computeIdleZones(pts, "elapsed")).toEqual([{ x1: 1, x2: 2 }])
  })

  it("detects a SHORT idle that downsampling would drop", () => {
    // 1000 samples. A single idle sample sits at index 500, but the DOWNSAMPLED series is chosen on
    // a smooth `y` unrelated to speed, so that lone idle point is dropped from the retained set.
    const pts: DataPoint[] = Array.from({ length: 1000 }, (_, i) => {
      const p = row(i, i === 500 ? 0 : 50, i)
      p.y = Math.sin(i / 50) // smooth, independent of the idle dip
      return p
    })
    const downsampled = lttbDownsample(pts, 20, (p) => p.y as number, (p) => p.elapsed as number)
    // The idle sample is not among the retained points...
    expect(downsampled.some((p) => (p.speed || 0) === 0)).toBe(false)
    // ...yet the idle zone computed from the FULL data still captures it.
    const zones = computeIdleZones(pts, "elapsed")
    expect(zones).toContainEqual({ x1: 500, x2: 501 })
  })

  it("falls back to sample index when the x key is absent", () => {
    const pts = [
      { time: 5, timestamp: "", speed: 30 } as DataPoint,
      { time: 6, timestamp: "", speed: 0 } as DataPoint,
      { time: 7, timestamp: "", speed: 20 } as DataPoint,
    ]
    expect(computeIdleZones(pts, "elapsed")).toEqual([{ x1: 6, x2: 7 }])
  })
})
