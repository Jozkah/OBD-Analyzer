import { describe, it, expect } from "vitest"
import { computeTimeAxis } from "./elapsed-time"
import { advancePlayback, MAX_GAP_SECONDS } from "./playback"
import { analyzeTimestamps } from "./timestamps"
import { parseLogTimeSeconds, detectAccelRuns } from "./accel-runs"

const base = Date.UTC(2024, 0, 1, 0, 0, 0)
const at = (sec: number) => new Date(base + sec * 1000).toISOString()

// Drive the whole chain: raw timestamps → computeTimeAxis → advancePlayback.
function play(raw: (string | number)[], dtMs: number, rate = 1, fromIndex = 0) {
  const axis = computeTimeAxis(raw)
  const res = advancePlayback({
    elapsed: axis.elapsed,
    trustworthy: axis.trustworthy,
    index: fromIndex,
    lo: 0,
    hi: raw.length - 1,
    rate,
    dtMs,
    acc: 0,
  })
  return { axis, res }
}

describe("raw timestamps → computeTimeAxis → advancePlayback", () => {
  it("two valid samples: trusted axis, one real second advances one sample", () => {
    const { axis, res } = play([at(0), at(1)], 1000)
    expect(axis.trustworthy).toBe(true)
    expect(res.index).toBe(1)
    expect(res.atEnd).toBe(true)
  })

  it("irregular valid intervals advance by real elapsed time", () => {
    const { axis, res } = play([at(0), at(0.1), at(0.2), at(5)], 250)
    expect(axis.trustworthy).toBe(true)
    expect(res.index).toBe(2) // consumed 0.1 + 0.1 of the 0.25s budget
  })

  it("duplicate timestamps are crossed for free", () => {
    const { axis, res } = play([at(0), at(0), at(0), at(1)], 1)
    expect(axis.trustworthy).toBe(true)
    expect(res.index).toBe(2) // zero-cost duplicates crossed; the 1s step remains
  })

  it("a >30s forward gap keeps a trusted axis and is crossed within the cap", () => {
    const raw = [at(0), at(1), at(61), at(62)]
    const { axis } = play(raw, 0)
    expect(axis.trustworthy).toBe(true) // NOT downgraded to sample-based
    const res = advancePlayback({
      elapsed: axis.elapsed, trustworthy: true, index: 1, lo: 0, hi: 3,
      rate: 1, dtMs: MAX_GAP_SECONDS * 1000, acc: 0,
    })
    expect(res.index).toBeGreaterThanOrEqual(2) // the 60s gap is capped, so it advances
  })

  it("backwards timestamps fall back to the untrusted sample cadence", () => {
    const { axis, res } = play([at(0), at(2), at(1), at(3)], 500) // non-monotonic
    expect(axis.trustworthy).toBe(false)
    expect(res.index).toBe(3) // 0.5s × 10 Hz fallback = 5 samples, clamped to hi
  })

  it("index-like placeholders fall back to untrusted", () => {
    const { axis } = play(["0", "1", "2", "3"], 0)
    expect(axis.trustworthy).toBe(false)
  })

  it("all-duplicate timestamps are untrusted", () => {
    const { axis } = play([at(4), at(4), at(4)], 0)
    expect(axis.trustworthy).toBe(false)
  })
})

describe("acceleration continuity is stricter than the elapsed axis", () => {
  it("does not fabricate a run across a large recording gap", () => {
    // 0→100 km/h split by a 10-minute gap: the elapsed axis trusts it, but accel timing must not
    // report a bogus ~600s (or bridged) run.
    const raw = [at(0), at(1), at(600), at(601), at(602)]
    const speeds = [0, 5, 50, 100, 100]
    expect(computeTimeAxis(raw).trustworthy).toBe(true)
    // The strict accel gate rejects the discontinuous series outright (no fake run).
    expect(parseLogTimeSeconds(raw)).toBeNull()
    const times = parseLogTimeSeconds(raw)
    const runs = times ? detectAccelRuns(times, speeds) : []
    expect(runs).toEqual([])
  })

  it("still finds a real run on a continuous series", () => {
    const raw = Array.from({ length: 8 }, (_, i) => at(i))
    const speeds = [0, 15, 35, 60, 82, 100, 110, 120]
    const times = parseLogTimeSeconds(raw)
    expect(times).not.toBeNull()
    const runs = detectAccelRuns(times!, speeds)
    expect(runs.some((r) => r.label.includes("100"))).toBe(true)
  })
})
