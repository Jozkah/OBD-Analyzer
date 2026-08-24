import { describe, it, expect } from "vitest"
import { cumulativeForwardTotal } from "./cumulative"
import { computeFuelEconomyL100km } from "./fuel"

describe("cumulativeForwardTotal", () => {
  it("a zero-based counter totals its forward increments", () => {
    expect(cumulativeForwardTotal([0, 0.1, 0.3, 0.6])).toBeCloseTo(0.6, 6)
  })

  it("excludes a non-zero initial baseline (captured mid-trip)", () => {
    // [5.0, 5.1, 5.2] → recorded-window delta is 0.2, NOT 5.2.
    expect(cumulativeForwardTotal([5.0, 5.1, 5.2])).toBeCloseTo(0.2, 6)
  })

  it("treats a mid-log reset as a re-baseline (never subtracts)", () => {
    // 5.0→5.4 (+0.4), reset to 0, 0→0.3 (+0.3) = 0.7
    expect(cumulativeForwardTotal([5.0, 5.2, 5.4, 0, 0.1, 0.3])).toBeCloseTo(0.7, 6)
  })

  it("ignores missing/non-finite samples between valid ones (no fake increment)", () => {
    expect(cumulativeForwardTotal([2.0, undefined, 2.2, null, 2.5, NaN])).toBeCloseTo(0.5, 6)
  })

  it("returns null for all-missing input (unavailable, not 0)", () => {
    expect(cumulativeForwardTotal([undefined, null, NaN])).toBeNull()
    expect(cumulativeForwardTotal([])).toBeNull()
  })

  it("a single finite value is a baseline only → total 0", () => {
    expect(cumulativeForwardTotal([7.5])).toBe(0)
  })
})

describe("fuel economy uses the recorded-window fuel delta", () => {
  it("computes L/100km from the windowed litres, not the raw cumulative value", () => {
    // Captured mid-trip: cumulative fuel [5.0 … 8.0] L over a 40 km window → 3 L / 40 km = 7.5 L/100km.
    const litres = cumulativeForwardTotal([5.0, 6.0, 7.0, 8.0]) // 3.0 L window delta
    expect(litres).toBeCloseTo(3.0, 6)
    expect(computeFuelEconomyL100km(litres, 40)).toBeCloseTo(7.5, 6)
    // The buggy baseline-inclusive total (8.0) would give a wildly wrong 20 L/100km.
    expect(computeFuelEconomyL100km(8.0, 40)).toBeCloseTo(20, 6)
  })
})
