import { describe, it, expect } from "vitest"
import { validateTransmissionConfig, isTransmissionConfigValid } from "./transmission-validate"
import type { TransmissionConfig } from "@/types/obd"

const valid: TransmissionConfig = {
  gearRatios: { 1: 3.5, 2: 1.9, 3: 1.3, 4: 1.0, 5: 0.8, 6: 0.68 },
  finalDrive: 4.35,
  tyreDiameterMm: 647,
  shiftRpm: 6900,
  numberOfGears: 6,
}

describe("validateTransmissionConfig", () => {
  it("accepts a sensible configuration", () => {
    expect(validateTransmissionConfig(valid)).toEqual([])
    expect(isTransmissionConfigValid(valid)).toBe(true)
  })

  it("rejects a zero/negative final drive", () => {
    const e = validateTransmissionConfig({ ...valid, finalDrive: 0 })
    expect(e.some((x) => x.field === "finalDrive")).toBe(true)
  })

  it("rejects an out-of-range tyre diameter", () => {
    expect(validateTransmissionConfig({ ...valid, tyreDiameterMm: 50 }).some((x) => x.field === "tyreDiameterMm")).toBe(true)
  })

  it("rejects a non-positive gear ratio", () => {
    const e = validateTransmissionConfig({ ...valid, gearRatios: { ...valid.gearRatios, 3: 0 } })
    expect(e.some((x) => x.field === "gear-3")).toBe(true)
  })

  it("rejects a missing gear ratio for the declared gear count", () => {
    const e = validateTransmissionConfig({ ...valid, gearRatios: { 1: 3.5, 2: 1.9, 3: 1.3 }, numberOfGears: 6 })
    expect(e.some((x) => x.field === "gear-6")).toBe(true)
  })

  it("rejects an out-of-range gear count", () => {
    expect(validateTransmissionConfig({ ...valid, numberOfGears: 2 }).some((x) => x.field === "numberOfGears")).toBe(true)
  })
})
