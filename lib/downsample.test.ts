import { describe, it, expect } from "vitest"
import { lttbDownsample } from "./downsample"

interface P { i: number; x: number; y: number }

describe("lttbDownsample", () => {
  it("keeps whole rows, endpoints, and stays within budget", () => {
    const pts: P[] = Array.from({ length: 2000 }, (_, i) => ({ i, x: i, y: Math.sin(i / 9) }))
    const out = lttbDownsample(pts, 500, (p) => p.y)
    expect(out.length).toBeLessThanOrEqual(500)
    expect(out[0].i).toBe(0)
    expect(out[out.length - 1].i).toBe(1999)
    for (const p of out) expect(pts[p.i]).toBe(p) // whole original rows preserved
  })

  it("selects different points with an x-accessor on irregular spacing", () => {
    // Irregular x: dense early, sparse late — index-aware and x-aware LTTB should diverge.
    const pts: P[] = Array.from({ length: 1000 }, (_, i) => {
      const x = i < 900 ? i * 0.01 : 9 + (i - 900) * 5 // compressed then stretched
      return { i, x, y: Math.sin(i / 7) + (i % 13) * 0.1 }
    })
    const indexAware = lttbDownsample(pts, 200, (p) => p.y).map((p) => p.i)
    const xAware = lttbDownsample(pts, 200, (p) => p.y, (p) => p.x).map((p) => p.i)
    expect(xAware).not.toEqual(indexAware)
    // Endpoints still shared.
    expect(xAware[0]).toBe(0)
    expect(xAware[xAware.length - 1]).toBe(999)
  })

  it("selects different points for distance vs elapsed on variable-speed data", () => {
    // Elapsed advances uniformly, but distance advances with speed: fast early, crawling late.
    // So distance-aware and elapsed-aware LTTB should retain different interior points.
    let dist = 0
    const pts = Array.from({ length: 1000 }, (_, i) => {
      const speed = i < 500 ? 100 : 2 // fast, then a crawl
      dist += speed / 3600
      return { i, elapsed: i, dist, y: Math.sin(i / 8) + (i % 11) * 0.1 }
    })
    const elapsedAware = lttbDownsample(pts, 200, (p) => p.y, (p) => p.elapsed).map((p) => p.i)
    const distAware = lttbDownsample(pts, 200, (p) => p.y, (p) => p.dist).map((p) => p.i)
    expect(distAware).not.toEqual(elapsedAware)
    // Endpoints preserved in both modes.
    expect(distAware[0]).toBe(0)
    expect(distAware[distAware.length - 1]).toBe(999)
    expect(elapsedAware[0]).toBe(0)
    expect(elapsedAware[elapsedAware.length - 1]).toBe(999)
  })

  it("returns the input unchanged below the threshold", () => {
    const pts: P[] = Array.from({ length: 10 }, (_, i) => ({ i, x: i, y: i }))
    expect(lttbDownsample(pts, 500, (p) => p.y)).toBe(pts)
  })
})
