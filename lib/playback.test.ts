import { describe, it, expect } from "vitest"
import { advancePlayback, MAX_GAP_SECONDS } from "./playback"

// elapsed arrays are seconds-per-sample (as produced by computeTimeAxis).
const regular = [0, 1, 2, 3, 4, 5] // 1 Hz
const irregular = [0, 0.1, 0.2, 5, 5.1] // dense, then a 4.8s gap
const duplicates = [0, 0, 0, 1, 2] // duplicate timestamps at the start

describe("advancePlayback — trusted timestamps", () => {
  it("advances one sample per real second at 1×", () => {
    const r = advancePlayback({ elapsed: regular, trustworthy: true, index: 0, lo: 0, hi: 5, rate: 1, dtMs: 1000, acc: 0 })
    expect(r.index).toBe(1)
    expect(r.atEnd).toBe(false)
  })

  it("advances proportionally faster at higher rates", () => {
    const r = advancePlayback({ elapsed: regular, trustworthy: true, index: 0, lo: 0, hi: 5, rate: 2, dtMs: 1000, acc: 0 })
    expect(r.index).toBe(2) // 2 log-seconds in 1 real second
  })

  it("carries sub-step time in the accumulator (pause/resume friendly)", () => {
    const first = advancePlayback({ elapsed: regular, trustworthy: true, index: 0, lo: 0, hi: 5, rate: 1, dtMs: 400, acc: 0 })
    expect(first.index).toBe(0)
    expect(first.acc).toBeCloseTo(0.4, 5)
    const second = advancePlayback({ elapsed: regular, trustworthy: true, index: first.index, lo: 0, hi: 5, rate: 1, dtMs: 700, acc: first.acc })
    expect(second.index).toBe(1) // 0.4 + 0.7 = 1.1 ≥ 1 → advance one sample
    expect(second.acc).toBeCloseTo(0.1, 5)
  })

  it("plays dense samples quickly and does not stall on duplicate timestamps", () => {
    // 0.2s spans indices 0..2 (deltas 0.1,0.1) then a duplicate-free step; from 0 with 0.25s
    const r = advancePlayback({ elapsed: irregular, trustworthy: true, index: 0, lo: 0, hi: 4, rate: 1, dtMs: 250, acc: 0 })
    expect(r.index).toBe(2) // consumed 0.1 + 0.1, 0.05 left
    expect(r.acc).toBeCloseTo(0.05, 5)
  })

  it("does not stall on duplicate timestamps (delta ≤ 0 costs nothing)", () => {
    // A tiny 1ms budget: the two zero-cost duplicate steps (0→1→2) are consumed for free,
    // then the real 1s step (2→3) exceeds the budget, so playback lands on index 2 rather
    // than stalling at 0 on the duplicates.
    const r = advancePlayback({ elapsed: duplicates, trustworthy: true, index: 0, lo: 0, hi: 4, rate: 1, dtMs: 1, acc: 0 })
    expect(r.index).toBe(2)
  })

  it("caps a pathological gap so playback doesn't freeze", () => {
    // Gap 0.2→5 is 4.8s but is capped to MAX_GAP_SECONDS; MAX_GAP seconds of budget crosses it.
    const r = advancePlayback({ elapsed: irregular, trustworthy: true, index: 2, lo: 0, hi: 4, rate: 1, dtMs: MAX_GAP_SECONDS * 1000, acc: 0 })
    expect(r.index).toBeGreaterThanOrEqual(3)
    expect(MAX_GAP_SECONDS).toBeLessThan(4.8)
  })

  it("stops at the range end and reports atEnd", () => {
    const r = advancePlayback({ elapsed: regular, trustworthy: true, index: 4, lo: 0, hi: 5, rate: 1, dtMs: 5000, acc: 0 })
    expect(r.index).toBe(5)
    expect(r.atEnd).toBe(true)
    expect(r.acc).toBe(0)
  })

  it("snaps an out-of-window index up to lo before advancing", () => {
    const r = advancePlayback({ elapsed: regular, trustworthy: true, index: 0, lo: 2, hi: 5, rate: 1, dtMs: 0, acc: 0 })
    expect(r.index).toBe(2)
  })
})

describe("advancePlayback — untrusted timestamps", () => {
  it("falls back to a fixed cadence (10 Hz default)", () => {
    const elapsed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // index-as-position, not real time
    const r = advancePlayback({ elapsed, trustworthy: false, index: 0, lo: 0, hi: 10, rate: 1, dtMs: 500, acc: 0 })
    expect(r.index).toBe(5) // 0.5s × 10 Hz = 5 samples
  })

  it("scales the fallback cadence by the playback rate", () => {
    const elapsed = Array.from({ length: 41 }, (_, i) => i)
    const r = advancePlayback({ elapsed, trustworthy: false, index: 0, lo: 0, hi: 40, rate: 4, dtMs: 500, acc: 0 })
    expect(r.index).toBe(20) // 0.5s × 10 Hz × 4 = 20 samples
  })
})
