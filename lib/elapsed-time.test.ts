import { describe, it, expect } from "vitest"
import { computeTimeAxis, formatDuration, formatPosition } from "./elapsed-time"

// Build ISO timestamps spaced `stepSec` apart.
function stamps(n: number, stepSec = 1): string[] {
  const base = Date.UTC(2024, 0, 1, 0, 0, 0)
  return Array.from({ length: n }, (_, i) => new Date(base + i * stepSec * 1000).toISOString())
}

describe("computeTimeAxis", () => {
  it("marks real, evenly spaced timestamps as trustworthy with correct elapsed seconds", () => {
    const axis = computeTimeAxis(stamps(5, 2))
    expect(axis.trustworthy).toBe(true)
    expect(axis.elapsed).toEqual([0, 2, 4, 6, 8])
    expect(axis.totalSeconds).toBe(8)
  })

  it("falls back to sample index when timestamps are not real clock times", () => {
    const axis = computeTimeAxis(["0", "1", "2", "3"])
    expect(axis.trustworthy).toBe(false)
    expect(axis.elapsed).toEqual([0, 1, 2, 3])
    expect(axis.totalSeconds).toBeNull()
  })

  it("rejects non-monotonic timestamps", () => {
    const s = stamps(4)
    ;[s[1], s[2]] = [s[2], s[1]]
    expect(computeTimeAxis(s).trustworthy).toBe(false)
  })
})

describe("formatDuration", () => {
  it("formats sub-hour as M:SS", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(9)).toBe("0:09")
    expect(formatDuration(83)).toBe("1:23")
  })
  it("formats past an hour as H:MM:SS", () => {
    expect(formatDuration(3723)).toBe("1:02:03")
  })
})

describe("formatPosition", () => {
  it("shows elapsed time when trustworthy", () => {
    const axis = computeTimeAxis(stamps(10))
    expect(formatPosition(axis, 3, 9)).toBe("0:03 / 0:09")
  })
  it("shows sample numbers when not trustworthy", () => {
    const axis = computeTimeAxis(["a", "b", "c"])
    expect(formatPosition(axis, 1, 2)).toBe("Sample 1 / 2")
  })
})
