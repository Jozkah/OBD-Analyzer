// Drift-resistant playback stepping.
//
// The old playback advanced one sample every `100 / rate` ms, which only matched real time for a
// 10 Hz log. This module maps real wall-clock time onto the log's own timeline instead:
//
// - When timestamps are trustworthy, each step consumes the REAL elapsed gap between consecutive
//   samples (elapsed[i+1] - elapsed[i]), scaled by the playback rate. Irregular sampling, small
//   deltas and duplicate timestamps (delta ≤ 0) therefore play back at their true pace.
// - A pathological gap is capped (MAX_GAP_SECONDS) so a long recording gap doesn't freeze the UI
//   — playback skips across it in bounded time.
// - When timestamps are untrustworthy, there is no real clock, so we fall back to a fixed sample
//   cadence (FALLBACK_HZ) and the UI must label the mode as approximate/sample-based.
//
// A leftover-seconds accumulator carries sub-step time between frames, so the design is
// deadline/accumulator based and does not drift the way chained fixed intervals do.

export const MAX_GAP_SECONDS = 2 // cap per inter-sample duration so gaps don't stall playback
export const FALLBACK_HZ = 10 // sample cadence when timestamps are untrustworthy

export interface AdvanceParams {
  /** Elapsed seconds per sample (from computeTimeAxis). */
  elapsed: number[]
  /** Whether `elapsed` reflects real clock time. */
  trustworthy: boolean
  /** Current sample index. */
  index: number
  /** Inclusive range bounds (indices). */
  lo: number
  hi: number
  /** Playback speed multiplier (0.5, 1, 2, 4, …). */
  rate: number
  /** Real wall-clock milliseconds since the previous tick. */
  dtMs: number
  /** Leftover virtual seconds carried from the previous tick. */
  acc: number
  maxGapSeconds?: number
  fallbackHz?: number
}

export interface AdvanceResult {
  index: number
  /** Leftover virtual seconds to carry into the next tick. */
  acc: number
  /** True once the cursor has reached the range end (hi). */
  atEnd: boolean
}

/** The effective time (seconds) it should take to play from sample i to i+1. */
function stepSeconds(elapsed: number[], i: number, maxGap: number): number {
  const raw = (elapsed[i + 1] ?? elapsed[i]) - elapsed[i]
  if (!(raw > 0)) return 0 // duplicate/backwards timestamp → advance immediately
  return Math.min(raw, maxGap)
}

/**
 * Pure playback stepper. Given how much real time passed since the last tick, return the next
 * sample index and the leftover accumulator. Never advances past `hi`.
 */
export function advancePlayback(p: AdvanceParams): AdvanceResult {
  const maxGap = p.maxGapSeconds ?? MAX_GAP_SECONDS
  const fallbackHz = p.fallbackHz ?? FALLBACK_HZ
  const rate = p.rate > 0 ? p.rate : 1

  // Snap an out-of-range cursor to the window start before advancing.
  let index = p.index < p.lo ? p.lo : p.index > p.hi ? p.hi : p.index
  if (index >= p.hi) return { index: p.hi, acc: 0, atEnd: true }

  // Virtual (log-time) seconds available to spend this tick.
  let budget = p.acc + (p.dtMs / 1000) * rate
  if (!(budget > 0)) return { index, acc: Math.max(0, p.acc), atEnd: false }

  if (p.trustworthy) {
    while (index < p.hi) {
      const cost = stepSeconds(p.elapsed, index, maxGap)
      if (cost > budget) break
      budget -= cost
      index++
    }
  } else {
    // No real clock: each sample takes 1/fallbackHz virtual seconds. Compute the step count
    // directly (a subtraction loop accumulates float error and drops the last step).
    const perSample = 1 / fallbackHz
    const steps = Math.floor(budget / perSample + 1e-9)
    const take = Math.min(steps, p.hi - index)
    index += take
    budget -= take * perSample
  }

  const atEnd = index >= p.hi
  // Don't accumulate unbounded budget once stopped at the end.
  return { index, acc: atEnd ? 0 : budget, atEnd }
}
