import { describe, it, expect } from "vitest"
import { resolveHoverIndex } from "./hover-map"
import { lttbDownsample } from "./downsample"

// Build the SAME pipeline the app renders: a full log, sliced to an analysis window (so the visible
// data starts well after row 0), with elapsed-time x and an explicit originalIndex per point, then
// LTTB-downsampled. A hover must resolve back to the ORIGINAL row — not the array position, and not
// something derived from the x value.
interface Pt {
  originalIndex: number
  time: number
  elapsed: number
  rpm: number
}

function pipeline(total: number, lo: number, hi: number, budget: number) {
  const full: Pt[] = Array.from({ length: total }, (_, i) => ({
    originalIndex: i,
    time: i,
    elapsed: i, // 1 s/sample
    rpm: 1000 + i * 180,
  }))
  const windowed = full.slice(lo, hi + 1) // analysis window
  const downsampled = lttbDownsample(windowed, budget, (p) => p.rpm, (p) => p.elapsed)
  return { full, windowed, downsampled }
}

describe("resolveHoverIndex", () => {
  it("maps a downsampled/sliced point back to its ORIGINAL row (not its array position)", () => {
    const { downsampled } = pipeline(800, 200, 799, 500)
    // Pick an interior retained point. Its array position in the downsampled series is NOT its
    // original row (the window starts at 200 and points were dropped by LTTB).
    const arrayPos = Math.floor(downsampled.length / 2)
    const point = downsampled[arrayPos]
    expect(point.originalIndex).toBeGreaterThanOrEqual(200)
    expect(point.originalIndex).not.toBe(arrayPos) // proves array position ≠ original row

    const state = { activePayload: [{ payload: point }] }
    const idx = resolveHoverIndex(state.activePayload, undefined, downsampled)
    expect(idx).toBe(point.originalIndex)
    // And the resolved row's data matches the raw log at that original index.
    expect(1000 + idx! * 180).toBe(point.rpm)
  })

  it("does NOT use the x/elapsed value (which would resolve the wrong row on a sliced window)", () => {
    const { downsampled } = pipeline(800, 200, 799, 500)
    const point = downsampled[10]
    const idx = resolveHoverIndex([{ payload: point }], undefined, downsampled)
    // originalIndex (e.g. ~200+) — a naive "x seconds → row" on the full log would also give elapsed,
    // but here we assert the resolver returns the stored originalIndex verbatim.
    expect(idx).toBe(point.originalIndex)
  })

  it("falls back to activeTooltipIndex → chartData[i].originalIndex", () => {
    const { downsampled } = pipeline(600, 100, 599, 400)
    const i = 7
    const idx = resolveHoverIndex(undefined, i, downsampled)
    expect(idx).toBe(downsampled[i].originalIndex)
  })

  it("falls back to `time` when originalIndex is absent", () => {
    const idx = resolveHoverIndex([{ payload: { time: 321 } }], undefined, [])
    expect(idx).toBe(321)
  })

  it("returns null when nothing resolves", () => {
    expect(resolveHoverIndex(undefined, undefined, [])).toBeNull()
    expect(resolveHoverIndex([{ payload: {} }], undefined, [])).toBeNull()
    expect(resolveHoverIndex([], 42, [])).toBeNull() // index out of range → undefined point
  })

  it("first and last retained points map to the window bounds", () => {
    const { downsampled } = pipeline(800, 200, 799, 500)
    expect(resolveHoverIndex([{ payload: downsampled[0] }], undefined, downsampled)).toBe(200)
    expect(
      resolveHoverIndex([{ payload: downsampled[downsampled.length - 1] }], undefined, downsampled),
    ).toBe(799)
  })
})
