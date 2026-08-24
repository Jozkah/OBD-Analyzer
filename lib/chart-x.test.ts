import { describe, it, expect } from "vitest"
import { buildChartXAxis } from "./chart-x"
import { computeTimeAxis } from "./elapsed-time"
import { lttbDownsample } from "./downsample"

function stamps(n: number, stepSec = 1): string[] {
  const base = Date.UTC(2024, 0, 1, 0, 0, 0)
  return Array.from({ length: n }, (_, i) => new Date(base + i * stepSec * 1000).toISOString())
}

describe("buildChartXAxis", () => {
  it("uses elapsed seconds labelled 'Time' for trustworthy timestamps", () => {
    const axis = buildChartXAxis(computeTimeAxis(stamps(6)))
    expect(axis.key).toBe("elapsed")
    expect(axis.label).toBe("Time")
    expect(axis.trustworthy).toBe(true)
    expect(axis.format(83)).toBe("1:23")
  })

  it("uses the sample index labelled 'Sample' when timestamps are untrusted", () => {
    const axis = buildChartXAxis(computeTimeAxis(["0", "1", "2"]))
    expect(axis.key).toBe("time")
    expect(axis.label).toBe("Sample")
    expect(axis.trustworthy).toBe(false)
    expect(axis.format(4)).toBe("#4")
  })
})

describe("downsampled point → original sample mapping", () => {
  it("preserves each kept point's original index so hover maps to the right row", () => {
    // Points carry an original index in `time`; downsampling must keep whole points.
    const pts = Array.from({ length: 2000 }, (_, i) => ({ time: i, y: Math.sin(i / 10) }))
    const down = lttbDownsample(pts, 500, (p) => p.y)
    expect(down.length).toBeLessThanOrEqual(500)
    // Every kept point's `time` still indexes back into the original array at the same object.
    for (const p of down) {
      expect(pts[p.time]).toBe(p)
    }
    // First and last originals are retained (LTTB guarantees the endpoints).
    expect(down[0].time).toBe(0)
    expect(down[down.length - 1].time).toBe(1999)
  })
})
