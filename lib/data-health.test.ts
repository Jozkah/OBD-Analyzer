import { describe, it, expect } from "vitest"
import { analyzeDataHealth, summarizeHealth, type MissingPidsResult } from "./data-health"
import type { DataPoint, MetricConfig } from "@/types/obd"

const noMissing: MissingPidsResult = { missing: [], hasCriticalMissing: false }

function row(i: number, over: Partial<DataPoint> = {}): DataPoint {
  return {
    time: i,
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
    rpm: 2000,
    speed: 50,
    throttle: 20,
    brake: 0,
    boost: 0,
    coolantTemp: 85,
    intakeTemp: 20,
    fuelRate: 1,
    ...over,
  }
}

const metrics: MetricConfig[] = [
  { key: "rpm", label: "RPM", color: "#f00", unit: "RPM", enabled: true },
  { key: "speed", label: "Speed", color: "#0f0", unit: "km/h", enabled: true },
  { key: "boost", label: "Boost", color: "#00f", unit: "bar", enabled: false },
]

describe("analyzeDataHealth", () => {
  it("returns nothing for empty data", () => {
    expect(analyzeDataHealth([], metrics, noMissing)).toEqual([])
  })

  it("flags critical missing PIDs as the top finding", () => {
    const missing: MissingPidsResult = {
      missing: [{ name: "Vehicle Speed", keys: ["speed"], description: "", tabs: ["Overview"] }] as never,
      hasCriticalMissing: true,
    }
    const findings = analyzeDataHealth([row(0), row(1), row(2)], metrics, missing)
    expect(findings[0].severity).toBe("critical")
    expect(findings[0].id).toBe("missing-critical")
  })

  it("flags empty channels (all-zero) as info", () => {
    const data = Array.from({ length: 5 }, (_, i) => row(i, { boost: 0 }))
    const findings = analyzeDataHealth(data, metrics, noMissing)
    expect(findings.some((f) => f.id === "channels-empty")).toBe(true)
  })

  it("detects recording gaps from irregular timestamps", () => {
    const data = [
      row(0),
      row(1),
      row(2),
      // jump 60s ahead → a gap
      row(3, { timestamp: new Date(Date.UTC(2024, 0, 1, 0, 1, 3)).toISOString() }),
      row(4, { timestamp: new Date(Date.UTC(2024, 0, 1, 0, 1, 4)).toISOString() }),
    ]
    const findings = analyzeDataHealth(data, metrics, noMissing)
    expect(findings.some((f) => f.id === "timestamps-gaps")).toBe(true)
  })

  it("warns when timestamps are not real clock times", () => {
    const data = [row(0, { timestamp: "0" }), row(1, { timestamp: "1" }), row(2, { timestamp: "2" })]
    const findings = analyzeDataHealth(data, metrics, noMissing)
    expect(findings.some((f) => f.id === "timestamps-unparseable")).toBe(true)
  })

  it("reports absent GPS", () => {
    const findings = analyzeDataHealth([row(0), row(1), row(2)], metrics, noMissing)
    expect(findings.some((f) => f.id === "gps-absent")).toBe(true)
  })

  it("handles a very large log without a stack overflow and reports the correct peak", () => {
    // 200k rows would overflow Math.max(...array); the reduce-based safeMax must not.
    const N = 200_000
    const data: DataPoint[] = new Array(N)
    for (let i = 0; i < N; i++) {
      data[i] = {
        time: i,
        timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + i * 1000).toISOString(),
        rpm: 2000,
        speed: 60,
        throttle: 20,
        brake: 0,
        boost: 0,
        coolantTemp: 85,
        intakeTemp: 20,
        fuelRate: 1,
      }
    }
    // Inject an implausible peak that the outlier check should surface.
    data[123_456].rpm = 13500
    const findings = analyzeDataHealth(data, metrics, noMissing)
    const rpmOutlier = findings.find((f) => f.id === "outlier-rpm")
    expect(rpmOutlier).toBeDefined()
    expect(rpmOutlier!.detail).toContain("13500")
  })

  it("summarizeHealth counts by severity", () => {
    const data = [row(0, { timestamp: "x" }), row(1, { timestamp: "y" }), row(2, { timestamp: "z" })]
    const s = summarizeHealth(analyzeDataHealth(data, metrics, noMissing))
    expect(s.critical + s.warning + s.info).toBeGreaterThan(0)
  })
})
