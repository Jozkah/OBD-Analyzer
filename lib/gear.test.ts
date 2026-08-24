import { describe, it, expect } from "vitest"
import { getShiftIndicator, shiftIndicatorView } from "./gear"
import type { TransmissionConfig } from "@/types/obd"

const config: TransmissionConfig = {
  gearRatios: { 1: 3.5, 2: 1.9, 3: 1.3, 4: 1.0, 5: 0.8, 6: 0.68 },
  finalDrive: 4.35,
  tyreDiameterMm: 647,
  shiftRpm: 6900, // shift up > 5865 (85%), down < 2070 (30%)
  numberOfGears: 6,
}

describe("getShiftIndicator", () => {
  it("recommends an upshift near redline when not in top gear", () => {
    const r = getShiftIndicator(6500, 3, config)
    expect(r.shouldShift).toBe("up")
    expect(r.reason).toMatch(/shift up/i)
  })

  it("does not recommend an upshift in the top gear", () => {
    expect(getShiftIndicator(6800, 6, config).shouldShift).toBe("optimal")
  })

  it("recommends a downshift at low RPM when not in first gear", () => {
    const r = getShiftIndicator(1500, 4, config)
    expect(r.shouldShift).toBe("down")
    expect(r.reason).toMatch(/shift down/i)
  })

  it("does not recommend a downshift in first gear", () => {
    expect(getShiftIndicator(1000, 1, config).shouldShift).toBe("optimal")
  })

  it("reports 'optimal' (hold) in the mid range", () => {
    const r = getShiftIndicator(4000, 3, config)
    expect(r.shouldShift).toBe("optimal")
    expect(r.reason).toMatch(/optimal/i)
  })

  it("returns no recommendation when rpm or gear is unavailable", () => {
    expect(getShiftIndicator(0, 3, config).shouldShift).toBeNull()
    expect(getShiftIndicator(4000, 0, config).shouldShift).toBeNull()
  })
})

describe("shiftIndicatorView", () => {
  it("maps an upshift to a named, labelled view", () => {
    const v = shiftIndicatorView({ shouldShift: "up", reason: "Shift up at 6500 RPM" })
    expect(v).not.toBeNull()
    expect(v!.state).toBe("up")
    expect(v!.label).toBe("Upshift")
    expect(v!.tone).toBe("up")
    expect(v!.accessibleName).toBe("Shift recommendation: Upshift — Shift up at 6500 RPM")
  })

  it("maps a downshift", () => {
    const v = shiftIndicatorView({ shouldShift: "down", reason: "Shift down at 1500 RPM" })
    expect(v!.state).toBe("down")
    expect(v!.label).toBe("Downshift")
    expect(v!.tone).toBe("down")
    expect(v!.accessibleName).toContain("Downshift")
  })

  it("maps 'optimal' to a hold tone with the Optimal label", () => {
    const v = shiftIndicatorView({ shouldShift: "optimal", reason: "" })
    expect(v!.state).toBe("optimal")
    expect(v!.label).toBe("Optimal")
    expect(v!.tone).toBe("hold")
    // Falls back to a meaningful reason when none is supplied.
    expect(v!.accessibleName).toBe("Shift recommendation: Optimal — Optimal gear")
  })

  it("returns null when unavailable (no recommendation)", () => {
    expect(shiftIndicatorView({ shouldShift: null, reason: "" })).toBeNull()
    expect(shiftIndicatorView(null)).toBeNull()
    expect(shiftIndicatorView(undefined)).toBeNull()
  })
})
