import { describe, it, expect } from "vitest"
import { fuelToLitres, computeFuelEconomyL100km } from "./fuel"

describe("fuelToLitres", () => {
  it("passes litres through (explicit or default)", () => {
    expect(fuelToLitres(5, "L")).toBe(5)
    expect(fuelToLitres(5, "litres")).toBe(5)
    expect(fuelToLitres(5, undefined)).toBe(5)
    expect(fuelToLitres(5, "")).toBe(5)
  })
  it("converts US gallons to litres", () => {
    expect(fuelToLitres(1, "gal")).toBeCloseTo(3.785411784, 6)
  })
  it("returns null for unsupported units", () => {
    expect(fuelToLitres(5, "%")).toBeNull()
    expect(fuelToLitres(5, "kWh")).toBeNull()
  })
})

describe("computeFuelEconomyL100km", () => {
  it("computes L/100km from litres and km", () => {
    // 6 L over 100 km = 6 L/100km
    expect(computeFuelEconomyL100km(6, 100)).toBeCloseTo(6, 6)
  })

  it("is correct after converting a miles distance to km", () => {
    // 2 US gal over 30 miles. Canonical: 7.5708 L over 48.28 km = 15.68 L/100km.
    const litres = fuelToLitres(2, "gal")!
    const km = 30 * 1.609344
    expect(computeFuelEconomyL100km(litres, km)).toBeCloseTo((litres / km) * 100, 6)
    expect(computeFuelEconomyL100km(litres, km)).toBeCloseTo(15.68, 1)
  })

  it("is null when distance is zero, missing, or fuel is unknown", () => {
    expect(computeFuelEconomyL100km(5, 0)).toBeNull()
    expect(computeFuelEconomyL100km(5, null)).toBeNull()
    expect(computeFuelEconomyL100km(null, 100)).toBeNull()
  })
})
