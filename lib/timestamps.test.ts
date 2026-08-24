import { describe, it, expect } from "vitest"
import { analyzeTimestamps } from "./timestamps"

const base = Date.UTC(2024, 0, 1, 0, 0, 0)
const at = (sec: number) => new Date(base + sec * 1000).toISOString()

describe("analyzeTimestamps — trust", () => {
  it("trusts a valid two-sample series (duration + axis available)", () => {
    const a = analyzeTimestamps([at(0), at(1)])
    expect(a.trusted).toBe(true)
    expect(a.elapsed).toEqual([0, 1])
    expect(a.spanSeconds).toBe(1)
  })

  it("trusts irregular intervals", () => {
    const a = analyzeTimestamps([at(0), at(0.1), at(0.2), at(5)])
    expect(a.trusted).toBe(true)
    expect(a.elapsed[3]).toBeCloseTo(5, 5)
  })

  it("stays trusted through duplicate timestamps but counts them", () => {
    const a = analyzeTimestamps([at(0), at(0), at(1), at(2)])
    expect(a.trusted).toBe(true)
    expect(a.duplicateCount).toBe(1)
    expect(a.spanSeconds).toBe(2)
  })

  it("stays trusted through a large forward gap but flags it", () => {
    const a = analyzeTimestamps([at(0), at(1), at(2), at(62), at(63)])
    expect(a.trusted).toBe(true)
    expect(a.gapCount).toBeGreaterThanOrEqual(1)
    expect(a.largestGapSeconds).toBeGreaterThan(30)
  })

  it("rejects backwards timestamps", () => {
    const a = analyzeTimestamps([at(0), at(2), at(1)])
    expect(a.trusted).toBe(false)
    expect(a.monotonic).toBe(false)
    expect(a.parseable).toBe(true)
  })

  it("rejects bare-number index placeholders", () => {
    const a = analyzeTimestamps(["0", "1", "2", "3"])
    expect(a.trusted).toBe(false)
    expect(a.allBareNumbers).toBe(true)
  })

  it("rejects unparseable values", () => {
    const a = analyzeTimestamps(["nope", "still no", "nah"])
    expect(a.trusted).toBe(false)
    expect(a.parseable).toBe(false)
  })

  it("rejects an all-duplicate / zero-span series", () => {
    const a = analyzeTimestamps([at(5), at(5), at(5)])
    expect(a.trusted).toBe(false)
    expect(a.spanSeconds).toBeNull()
  })
})
