import { describe, test, expect } from "vitest"
import { parseLogTimeSeconds, bestSpeedRun, detectAccelRuns } from "./accel-runs"

// Constant-acceleration reference: with speed_kmh = 10 * t, the car passes 100 km/h at
// exactly t = 10 s and 60 mph (96.5606 km/h) at t ≈ 9.656 s. Trapezoidal distance integration
// is exact for a linear velocity, so the ¼-mile (402.336 m) time matches the analytic
// 0.5·a·t² solution (a = 2.7778 m/s²) → t ≈ 17.02 s.
function linearRun(maxT = 20) {
  const times: number[] = []
  const speeds: number[] = []
  for (let t = 0; t <= maxT; t++) {
    times.push(t)
    speeds.push(10 * t) // km/h
  }
  return { times, speeds }
}

describe("parseLogTimeSeconds", () => {
  test("parses real increasing clock timestamps to elapsed seconds", () => {
    const out = parseLogTimeSeconds([
      "06/03/2025 02:22:17.489 PM",
      "06/03/2025 02:22:18.989 PM",
      "06/03/2025 02:22:20.489 PM",
    ])
    expect(out).not.toBeNull()
    expect(out![0]).toBe(0)
    expect(out![1]).toBeCloseTo(1.5, 3)
    expect(out![2]).toBeCloseTo(3.0, 3)
  })

  test("rejects index-placeholder timestamps", () => {
    expect(parseLogTimeSeconds(["0s", "1s", "2s"])).toBeNull()
  })

  test("rejects non-increasing series", () => {
    expect(
      parseLogTimeSeconds(["06/03/2025 02:22:20 PM", "06/03/2025 02:22:19 PM", "06/03/2025 02:22:21 PM"]),
    ).toBeNull()
  })

  test("rejects implausibly large gaps", () => {
    expect(
      parseLogTimeSeconds(["06/03/2025 02:22:00 PM", "06/03/2025 02:22:20 PM", "06/03/2025 02:25:00 PM"]),
    ).toBeNull() // 160 s gap > 30 s
  })

  test("rejects missing/non-string entries", () => {
    expect(parseLogTimeSeconds(["06/03/2025 02:22:00 PM", undefined, "06/03/2025 02:22:02 PM"])).toBeNull()
  })
})

describe("bestSpeedRun", () => {
  test("0–100 km/h from a standstill launch is 10.0 s", () => {
    const { times, speeds } = linearRun()
    const run = bestSpeedRun(times, speeds, 100)
    expect(run).not.toBeNull()
    expect(run!.seconds).toBeCloseTo(10.0, 2)
    expect(run!.fromIndex).toBe(0)
  })

  test("interpolates 0–60 mph (96.56 km/h) to ≈9.656 s", () => {
    const { times, speeds } = linearRun()
    const run = bestSpeedRun(times, speeds, 60 * 1.609344)
    expect(run!.seconds).toBeCloseTo(9.656, 2)
  })

  test("returns null when the target is never reached", () => {
    const times = [0, 1, 2, 3, 4]
    const speeds = [0, 10, 20, 30, 40] // never hits 100
    expect(bestSpeedRun(times, speeds, 100)).toBeNull()
  })

  test("picks the FASTEST of multiple launches", () => {
    // Slow pull (0→100 over 20 s), back to rest, then a quick pull (0→100 over 5 s).
    const times: number[] = []
    const speeds: number[] = []
    for (let t = 0; t <= 20; t++) {
      times.push(t)
      speeds.push(5 * t)
    } // slow: 100 at t=20
    let clock = 21
    speeds.push(0)
    times.push(clock++) // stop
    for (let k = 1; k <= 5; k++) {
      times.push(clock++)
      speeds.push(20 * k)
    } // quick: 100 at +5 s
    const run = bestSpeedRun(times, speeds, 100)
    expect(run!.seconds).toBeCloseTo(5.0, 2)
  })
})

describe("detectAccelRuns", () => {
  test("reports 0–100, 0–60 mph and ¼-mile for a full pull", () => {
    const { times, speeds } = linearRun()
    const runs = detectAccelRuns(times, speeds)
    const byLabel = Object.fromEntries(runs.map((r) => [r.label, r]))
    expect(byLabel["0–100 km/h"].seconds).toBeCloseTo(10.0, 2)
    expect(byLabel["0–60 mph"].seconds).toBeCloseTo(9.656, 2)
    expect(byLabel["¼ mile"].seconds).toBeCloseTo(17.02, 1)
    expect(byLabel["¼ mile"].detail).toMatch(/trap/)
  })

  test("a low-speed log yields no runs (feature stays empty)", () => {
    // Mirrors the bundled sample: never exceeds ~45 km/h.
    const times = [0, 1, 2, 3, 4, 5, 6]
    const speeds = [0, 20, 45, 40, 30, 10, 0]
    expect(detectAccelRuns(times, speeds)).toEqual([])
  })

  test("empty when times and speeds are misaligned", () => {
    expect(detectAccelRuns([0, 1, 2], [0, 10])).toEqual([])
  })
})
