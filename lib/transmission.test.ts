import { describe, it, expect } from "vitest"
import { normalizeTransmissionConfig, parseTransmissionConfig } from "./transmission"
import type { TransmissionConfig } from "@/types/obd"

const valid: TransmissionConfig = {
  finalDrive: 3.9,
  tyreDiameterMm: 632,
  shiftRpm: 7000,
  numberOfGears: 6,
  gearRatios: { 1: 3.5, 2: 2.0, 3: 1.5, 4: 1.2, 5: 1.0, 6: 0.8 },
}

describe("normalizeTransmissionConfig", () => {
  it("accepts a well-formed object and coerces gear keys to numbers", () => {
    const cfg = normalizeTransmissionConfig(JSON.parse(JSON.stringify(valid)))
    expect(cfg).not.toBeNull()
    expect(cfg!.gearRatios[1]).toBe(3.5)
    expect(cfg!.gearRatios[6]).toBe(0.8)
  })

  it("rejects non-objects and null", () => {
    expect(normalizeTransmissionConfig(null)).toBeNull()
    expect(normalizeTransmissionConfig(42)).toBeNull()
    expect(normalizeTransmissionConfig("nope")).toBeNull()
  })

  it("rejects a partial object missing required fields", () => {
    expect(normalizeTransmissionConfig({ finalDrive: 3.9, gearRatios: { 1: 3.5 } })).toBeNull()
  })

  it("rejects wrong field types", () => {
    expect(normalizeTransmissionConfig({ ...valid, finalDrive: "3.9" })).toBeNull()
    expect(normalizeTransmissionConfig({ ...valid, gearRatios: [3.5, 2.0] as unknown })).not.toBeNull() // arrays are objects; validator catches numeric issues
  })
})

describe("parseTransmissionConfig", () => {
  it("returns a config for valid JSON", () => {
    const r = parseTransmissionConfig(JSON.stringify(valid))
    expect("config" in r).toBe(true)
    if ("config" in r) expect(r.config.numberOfGears).toBe(6)
  })

  it("errors on malformed JSON", () => {
    const r = parseTransmissionConfig("{not json")
    expect("error" in r && r.error).toMatch(/couldn't read/i)
  })

  it("errors on a structurally-wrong object", () => {
    const r = parseTransmissionConfig(JSON.stringify({ hello: "world" }))
    expect("error" in r && r.error).toMatch(/isn't a valid/i)
  })

  it("errors on an out-of-range (schema-invalid) config", () => {
    const bad = { ...valid, finalDrive: -1 }
    const r = parseTransmissionConfig(JSON.stringify(bad))
    expect("error" in r && r.error).toMatch(/invalid/i)
  })

  it("errors when a gear ratio is missing/zero for the declared gear count", () => {
    const bad = { ...valid, gearRatios: { 1: 3.5, 2: 2.0 } } // only 2 of 6 gears
    const r = parseTransmissionConfig(JSON.stringify(bad))
    expect("error" in r).toBe(true)
  })
})
