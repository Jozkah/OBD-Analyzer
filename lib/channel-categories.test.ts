import { describe, it, expect } from "vitest"
import { categoryOf, labelForCategory } from "./channel-categories"

describe("categoryOf", () => {
  it("classifies standard channels", () => {
    expect(categoryOf({ label: "Engine RPM", originalName: "rpm" })).toBe("driving")
    expect(categoryOf({ label: "Boost", originalName: "MAP" })).toBe("boost")
    expect(categoryOf({ label: "Coolant Temp", originalName: "coolant_temperature" })).toBe("temps")
    expect(categoryOf({ label: "Fuel Rate", originalName: "fuel" })).toBe("fuel")
    expect(categoryOf({ label: "Ignition Advance", originalName: "timing_advance" })).toBe("ignition")
  })

  it("falls back to 'other' for unknown channels", () => {
    expect(categoryOf({ label: "Mystery Signal", originalName: "col_42" })).toBe("other")
  })
})

describe("labelForCategory", () => {
  it("maps ids to labels", () => {
    expect(labelForCategory("driving")).toBe("Driving")
    expect(labelForCategory("other")).toBe("Other")
  })
})
