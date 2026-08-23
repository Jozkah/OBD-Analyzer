import { describe, it, expect } from "vitest"
import { computeChannelStat } from "./channel-stats"
import type { DataPoint } from "@/types/obd"

function mk(values: (number | undefined)[], key = "rpm"): DataPoint[] {
  return values.map((v, i) => ({
    time: i, timestamp: `${i}`, rpm: 0, speed: 0, throttle: 0, brake: 0, boost: 0,
    coolantTemp: 0, intakeTemp: 0, fuelRate: 0, [key]: v,
  })) as DataPoint[]
}

describe("computeChannelStat", () => {
  it("computes min/max/avg and marks a varying channel healthy", () => {
    const st = computeChannelStat(mk([10, 20, 30]), "rpm")
    expect(st.min).toBe(10)
    expect(st.max).toBe(30)
    expect(st.avg).toBe(20)
    expect(st.status).toBe("healthy")
  })

  it("marks an all-zero channel empty", () => {
    expect(computeChannelStat(mk([0, 0, 0]), "rpm").status).toBe("empty")
  })

  it("marks a non-zero unchanging channel constant", () => {
    expect(computeChannelStat(mk([5, 5, 5]), "rpm").status).toBe("constant")
  })

  it("produces sampled points for a sparkline", () => {
    const st = computeChannelStat(mk(Array.from({ length: 120 }, (_, i) => i)), "rpm")
    expect(st.spark.length).toBeGreaterThan(1)
  })
})
