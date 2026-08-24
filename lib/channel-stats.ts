import type { DataPoint } from "@/types/obd"

export type ChannelStatus = "healthy" | "empty" | "constant"

export interface ChannelStat {
  min: number | null
  max: number | null
  avg: number | null
  status: ChannelStatus
  /** Sampled values for a sparkline (kept small). */
  spark: number[]
}

// Min/max/avg + a health status for one channel over the full dataset.
export function computeChannelStat(data: DataPoint[], key: string): ChannelStat {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let n = 0
  let allZeroish = true
  const spark: number[] = []
  const sampleStep = Math.max(1, Math.floor(data.length / 60))
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] as Record<string, unknown>)[key]
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v < min) min = v
      if (v > max) max = v
      sum += v
      n++
      if (v !== 0) allZeroish = false
      if (i % sampleStep === 0) spark.push(v)
    }
  }
  if (n === 0 || allZeroish) {
    return { min: n === 0 ? null : 0, max: n === 0 ? null : 0, avg: n === 0 ? null : 0, status: "empty", spark }
  }
  const status: ChannelStatus = min === max ? "constant" : "healthy"
  return { min, max, avg: sum / n, status, spark }
}
