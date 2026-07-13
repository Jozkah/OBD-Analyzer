// Acceleration-run detection (0–100 km/h, 0–60 mph, ¼-mile).
//
// Timing is only trustworthy when the log has real per-sample clock timestamps. The sample
// index ("time") is NOT time, so parseLogTimeSeconds returns null unless the timestamp column
// parses to a strictly increasing, sanely-spaced real-time series. Callers must hide the whole
// feature when it returns null rather than show wrong numbers.

const KMH_PER_MS = 3.6 // m/s → km/h
const MPH_IN_KMH = 1.609344 // 1 mph in km/h
const QUARTER_MILE_M = 402.336

export interface AccelRun {
  label: string // e.g. "0–100 km/h"
  seconds: number
  detail?: string // e.g. trap speed for the ¼-mile
  fromIndex: number
  toIndex: number
}

// Elapsed seconds per sample, or null when the timestamps aren't real clock times. A monotonic
// series with plausible gaps (0 < dt ≤ 30 s) is what separates genuine timestamps from index
// placeholders ("0s", "1s") or malformed columns.
export function parseLogTimeSeconds(timestamps: Array<string | undefined | null>): number[] | null {
  if (timestamps.length < 3) return null
  const ms: number[] = []
  for (const t of timestamps) {
    if (typeof t !== "string") return null
    const v = new Date(t).getTime()
    if (!Number.isFinite(v)) return null
    ms.push(v)
  }
  for (let i = 1; i < ms.length; i++) {
    const dt = ms[i] - ms[i - 1]
    if (dt <= 0 || dt > 30_000) return null
  }
  const t0 = ms[0]
  return ms.map((v) => (v - t0) / 1000)
}

// Linear-interpolated time at which speed first reaches `target` on the segment ending at i.
function crossTime(times: number[], speeds: number[], i: number, target: number): number {
  const s0 = speeds[i - 1]
  const s1 = speeds[i]
  if (s1 === s0) return times[i]
  const frac = (target - s0) / (s1 - s0)
  return times[i - 1] + frac * (times[i] - times[i - 1])
}

// Fastest run from a near-standstill launch (≤ startKmh) up to targetKmh. Each launch is
// consumed once it reaches the target; a dip back below startKmh arms a new launch.
export function bestSpeedRun(
  times: number[],
  speedsKmh: number[],
  targetKmh: number,
  startKmh = 5,
): { seconds: number; fromIndex: number; toIndex: number } | null {
  let best: { seconds: number; fromIndex: number; toIndex: number } | null = null
  let launch = -1
  for (let i = 0; i < speedsKmh.length; i++) {
    const v = speedsKmh[i]
    if (v <= startKmh) {
      launch = i
    } else if (launch >= 0 && i >= 1 && v >= targetKmh) {
      const seconds = crossTime(times, speedsKmh, i, targetKmh) - times[launch]
      if (seconds > 0 && (best === null || seconds < best.seconds)) {
        best = { seconds, fromIndex: launch, toIndex: i }
      }
      launch = -1
    }
  }
  return best
}

// Fastest standing ¼-mile: from a launch, integrate distance (trapezoidal on speed) until
// QUARTER_MILE_M is covered, reporting elapsed time and trap (exit) speed.
export function bestQuarterMile(
  times: number[],
  speedsKmh: number[],
  startKmh = 5,
): { seconds: number; trapKmh: number; fromIndex: number; toIndex: number } | null {
  let best: { seconds: number; trapKmh: number; fromIndex: number; toIndex: number } | null = null
  for (let start = 0; start < speedsKmh.length; start++) {
    if (speedsKmh[start] > startKmh) continue
    if (start + 1 < speedsKmh.length && speedsKmh[start + 1] <= startKmh) continue // still stationary
    let dist = 0
    for (let i = start + 1; i < speedsKmh.length; i++) {
      if (speedsKmh[i] <= startKmh) break // aborted launch
      const dt = times[i] - times[i - 1]
      const v0 = speedsKmh[i - 1] / KMH_PER_MS
      const v1 = speedsKmh[i] / KMH_PER_MS
      const seg = ((v0 + v1) / 2) * dt
      if (dist + seg >= QUARTER_MILE_M) {
        // Interpolate the fraction of this segment needed to hit the line.
        const frac = seg > 0 ? (QUARTER_MILE_M - dist) / seg : 0
        const seconds = times[i - 1] + frac * dt - times[start]
        const trapKmh = speedsKmh[i - 1] + frac * (speedsKmh[i] - speedsKmh[i - 1])
        if (seconds > 0 && (best === null || seconds < best.seconds)) {
          best = { seconds, trapKmh, fromIndex: start, toIndex: i }
        }
        break
      }
      dist += seg
    }
  }
  return best
}

// Assemble the labelled runs present in a log. `speedsKmh` must already be normalized to km/h.
export function detectAccelRuns(times: number[], speedsKmh: number[]): AccelRun[] {
  if (times.length !== speedsKmh.length || times.length < 3) return []
  const runs: AccelRun[] = []

  const to100 = bestSpeedRun(times, speedsKmh, 100)
  if (to100) runs.push({ label: "0–100 km/h", seconds: to100.seconds, ...idx(to100) })

  const to60mph = bestSpeedRun(times, speedsKmh, 60 * MPH_IN_KMH)
  if (to60mph) runs.push({ label: "0–60 mph", seconds: to60mph.seconds, ...idx(to60mph) })

  const quarter = bestQuarterMile(times, speedsKmh)
  if (quarter) {
    runs.push({
      label: "¼ mile",
      seconds: quarter.seconds,
      detail: `${Math.round(quarter.trapKmh)} km/h trap`,
      fromIndex: quarter.fromIndex,
      toIndex: quarter.toIndex,
    })
  }
  return runs
}

function idx(r: { fromIndex: number; toIndex: number }) {
  return { fromIndex: r.fromIndex, toIndex: r.toIndex }
}
