import { describe, it, expect } from "vitest"
import { computeCumulativeDistanceKm } from "./distance"

const elapsedAt = (n: number, step: number) => Array.from({ length: n }, (_, i) => i * step)

describe("computeCumulativeDistanceKm — integration", () => {
  it("uses real Δt for a 10 Hz log (no 10× overcount)", () => {
    const n = 100
    const speeds = new Array(n).fill(36) // 36 km/h = 10 m/s
    const elapsed = elapsedAt(n, 0.1) // 0 → 9.9 s
    const r = computeCumulativeDistanceKm({ speeds, speedUnit: "km/h", elapsed, trustedTime: true })
    expect(r.available).toBe(true)
    // 36 km/h over 9.9 s = 0.099 km — NOT 0.99 km (the 1-s-per-row bug).
    expect(r.dist[n - 1]).toBeCloseTo(0.099, 3)
  })

  it("integrates irregular intervals trapezoidally", () => {
    // 0→36 km/h over 2 s then hold 36 for 2 s. Elapsed [0,2,4].
    const speeds = [0, 36, 36]
    const elapsed = [0, 2, 4]
    const r = computeCumulativeDistanceKm({ speeds, speedUnit: "km/h", elapsed, trustedTime: true })
    // seg1: avg 18 km/h × 2/3600 h = 0.01 km; seg2: 36 × 2/3600 = 0.02 km → 0.03 km
    expect(r.dist[2]).toBeCloseTo(0.03, 4)
  })

  it("adds nothing across a duplicate timestamp (Δt = 0)", () => {
    const r = computeCumulativeDistanceKm({ speeds: [36, 36, 36], speedUnit: "km/h", elapsed: [0, 0, 1], trustedTime: true })
    // Only the 1 s segment counts: 36 × 1/3600 = 0.01 km
    expect(r.dist[2]).toBeCloseTo(0.01, 4)
  })

  it("does not integrate phantom distance across a large gap", () => {
    const r = computeCumulativeDistanceKm({ speeds: [36, 36, 36], speedUnit: "km/h", elapsed: [0, 1, 601], trustedTime: true })
    // seg1 (1 s) counts = 0.01 km; the 600 s gap is skipped.
    expect(r.dist[2]).toBeCloseTo(0.01, 4)
  })

  it("normalises mph to km before reporting kilometres", () => {
    const speeds = new Array(11).fill(60) // 60 mph
    const elapsed = elapsedAt(11, 1) // 10 s
    const r = computeCumulativeDistanceKm({ speeds, speedUnit: "mph", elapsed, trustedTime: true })
    // 60 mph = 96.56 km/h over 10 s = 0.2682 km
    expect(r.dist[10]).toBeCloseTo((60 * 1.609344 * 10) / 3600, 3)
  })

  it("is unavailable without a trip channel and without trustworthy time", () => {
    const r = computeCumulativeDistanceKm({ speeds: [10, 20, 30], speedUnit: "km/h", elapsed: [0, 1, 2], trustedTime: false })
    expect(r.available).toBe(false)
    expect(r.source).toBe("none")
  })
})

describe("computeCumulativeDistanceKm — trip distance channel", () => {
  it("sums forward increments in km", () => {
    const r = computeCumulativeDistanceKm({
      speeds: [0, 0, 0, 0], speedUnit: "km/h", elapsed: [0, 1, 2, 3], trustedTime: true,
      tripDistance: [0, 0.5, 1.0, 1.5], tripDistanceUnit: "km",
    })
    expect(r.source).toBe("trip")
    expect(r.dist[3]).toBeCloseTo(1.5, 3)
  })

  it("converts a miles trip channel to km (not mislabelled)", () => {
    const r = computeCumulativeDistanceKm({
      speeds: [0, 0], speedUnit: "mph", elapsed: [0, 1], trustedTime: true,
      tripDistance: [0, 1], tripDistanceUnit: "mi",
    })
    expect(r.dist[1]).toBeCloseTo(1.609, 3)
  })

  it("handles a trip-counter reset without subtracting", () => {
    const r = computeCumulativeDistanceKm({
      speeds: [0, 0, 0, 0], speedUnit: "km/h", elapsed: [0, 1, 2, 3], trustedTime: true,
      tripDistance: [0, 1.0, 0, 0.4], tripDistanceUnit: "km",
    })
    // 0→1.0 (+1.0), reset to 0 (skip), 0→0.4 (+0.4) = 1.4 km
    expect(r.dist[3]).toBeCloseTo(1.4, 3)
  })
})
