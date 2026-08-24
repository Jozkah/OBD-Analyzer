import { describe, it, expect } from "vitest"
import {
  isValidGpsFix,
  filterGpsFixes,
  classifyGpsCoverage,
  gpsBounds,
  trackDiagonalMetres,
  isDegenerateTrack,
  gpsSpeedRange,
} from "./gps"

type Pt = { latitude?: number | null; longitude?: number | null; speed?: number | null }

describe("isValidGpsFix / filterGpsFixes", () => {
  it("accepts finite coords including the equator/prime meridian, rejects (0,0) and non-finite", () => {
    expect(isValidGpsFix({ latitude: 51.5, longitude: -0.1 })).toBe(true)
    expect(isValidGpsFix({ latitude: 0, longitude: -0.1 })).toBe(true) // on the equator, valid
    expect(isValidGpsFix({ latitude: 51.5, longitude: 0 })).toBe(true) // on prime meridian, valid
    expect(isValidGpsFix({ latitude: 0, longitude: 0 })).toBe(false) // the "no fix" sentinel
    expect(isValidGpsFix({ latitude: NaN, longitude: 1 })).toBe(false)
    expect(isValidGpsFix({ latitude: undefined, longitude: 1 })).toBe(false)
  })

  it("filters a mixed list down to the valid fixes", () => {
    const pts: Pt[] = [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 0, longitude: 0 },
      { latitude: undefined, longitude: undefined },
      { latitude: 51.6, longitude: -0.2 },
    ]
    expect(filterGpsFixes(pts)).toHaveLength(2)
  })
})

describe("classifyGpsCoverage", () => {
  it("none when there are no fixes", () => {
    expect(classifyGpsCoverage(0, 100)).toBe("none")
    expect(classifyGpsCoverage(5, 0)).toBe("none")
  })
  it("sparse below 50% coverage, ok at/above", () => {
    expect(classifyGpsCoverage(49, 100)).toBe("sparse")
    expect(classifyGpsCoverage(50, 100)).toBe("ok")
    expect(classifyGpsCoverage(100, 100)).toBe("ok")
  })
})

describe("gpsBounds / degenerate track", () => {
  it("returns null when there are no valid fixes (missing GPS)", () => {
    expect(gpsBounds([{ latitude: 0, longitude: 0 }])).toBeNull()
    expect(isDegenerateTrack([{ latitude: 0, longitude: 0 }])).toBe(true)
  })

  it("computes a bounding box over valid fixes", () => {
    const b = gpsBounds([
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.7, longitude: 0.1 },
      { latitude: 0, longitude: 0 }, // ignored
    ])
    expect(b).toEqual({ minLat: 51.5, maxLat: 51.7, minLng: -0.1, maxLng: 0.1 })
  })

  it("flags a stationary/near-identical track as degenerate (< ~20 m diagonal)", () => {
    const stationary: Pt[] = Array.from({ length: 10 }, (_, i) => ({
      latitude: 51.5 + i * 0.00001, // ~1.1 m per step → whole span ≪ 20 m
      longitude: -0.1,
    }))
    expect(isDegenerateTrack(stationary)).toBe(true)
  })

  it("does not flag a real moving track as degenerate, and its diagonal is sane", () => {
    const moving: Pt[] = [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.09 }, // ~1.2 km away
    ]
    expect(isDegenerateTrack(moving)).toBe(false)
    const diag = trackDiagonalMetres(gpsBounds(moving)!)
    expect(diag).toBeGreaterThan(1000)
    expect(diag).toBeLessThan(2000)
  })
})

describe("gpsSpeedRange (unit-agnostic numeric range)", () => {
  const track = (speeds: number[]): Pt[] =>
    speeds.map((s, i) => ({ latitude: 51.5 + i * 0.001, longitude: -0.1, speed: s }))

  it("returns the raw min/max of the speed column for a km/h log", () => {
    const r = gpsSpeedRange(track([0, 30, 60, 45, 90]))
    expect(r).toEqual({ min: 0, max: 90, varies: true })
  })

  it("returns the SAME numbers for an mph log (no conversion is applied)", () => {
    // Identical numeric speeds, just interpreted as mph by the caller — the range is unchanged.
    const kmh = gpsSpeedRange(track([10, 20, 55]))
    const mph = gpsSpeedRange(track([10, 20, 55]))
    expect(mph).toEqual(kmh)
    expect(mph).toEqual({ min: 10, max: 55, varies: true })
  })

  it("reports no variation for a constant-speed track (single-colour, no gradient)", () => {
    const r = gpsSpeedRange(track([42, 42, 42, 42]))
    expect(r.varies).toBe(false)
    expect(r.min).toBe(42)
    expect(r.max).toBe(42)
  })

  it("treats missing speeds as 0", () => {
    const pts: Pt[] = [
      { latitude: 51.5, longitude: -0.1, speed: undefined },
      { latitude: 51.6, longitude: -0.1, speed: 50 },
    ]
    expect(gpsSpeedRange(pts)).toEqual({ min: 0, max: 50, varies: true })
  })

  it("returns a zero range when there are no fixes", () => {
    expect(gpsSpeedRange([{ latitude: 0, longitude: 0, speed: 10 }])).toEqual({ min: 0, max: 0, varies: false })
  })
})
