import { describe, it, expect } from "vitest"
import { computeSessionMeta, rangeOf, countGpsFixes } from "./session-summary"
import type { DataPoint } from "@/types/obd"

function row(i: number, over: Partial<DataPoint> = {}): DataPoint {
  return {
    time: i,
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
    rpm: 1000,
    speed: 50,
    throttle: 20,
    brake: 0,
    boost: 0,
    coolantTemp: 80 + i,
    intakeTemp: 20,
    fuelRate: 0,
    ...over,
  }
}

describe("rangeOf", () => {
  it("returns min/max over finite values", () => {
    const data = [row(0, { coolantTemp: 70 }), row(1, { coolantTemp: 90 }), row(2, { coolantTemp: 80 })]
    expect(rangeOf(data, "coolantTemp")).toEqual({ min: 70, max: 90 })
  })
  it("returns null when the channel is absent", () => {
    expect(rangeOf([row(0)], "nonexistent")).toBeNull()
  })
})

describe("countGpsFixes", () => {
  it("counts finite fixes and ignores the (0,0) sentinel", () => {
    const data = [
      row(0, { latitude: 51.5, longitude: -0.1 }),
      row(1, { latitude: 0, longitude: 0 }),
      row(2, { latitude: 51.6, longitude: -0.2 }),
      row(3),
    ]
    expect(countGpsFixes(data)).toBe(2)
  })
})

describe("computeSessionMeta", () => {
  it("derives duration, sampling rate and ranges from trustworthy timestamps", () => {
    const data = Array.from({ length: 11 }, (_, i) => row(i))
    const meta = computeSessionMeta(data)
    expect(meta.sampleCount).toBe(11)
    expect(meta.timeAxis.trustworthy).toBe(true)
    expect(meta.durationSeconds).toBe(10)
    expect(meta.effectiveHz).toBeCloseTo(1.1, 5)
    expect(meta.coolantRange).toEqual({ min: 80, max: 90 })
  })

  it("reports no duration when timestamps are unreliable", () => {
    const data = [row(0, { timestamp: "x" }), row(1, { timestamp: "y" }), row(2, { timestamp: "z" })]
    const meta = computeSessionMeta(data)
    expect(meta.timeAxis.trustworthy).toBe(false)
    expect(meta.durationSeconds).toBeNull()
    expect(meta.effectiveHz).toBeNull()
  })
})
