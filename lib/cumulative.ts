// Recorded-window total of a monotically-increasing cumulative counter (Trip Fuel, Trip Duration).
//
// A log can be captured midway through an already-running trip, so the counter's FIRST value is a
// baseline, not freshly-consumed fuel/time. The old `prev = 0` seed counted that whole baseline as
// consumed within the window — e.g. Trip Fuel [5.0, 5.1, 5.2] reported 5.2 L instead of the 0.2 L
// actually recorded, which also corrupted L/100km.
//
// Policy:
//  • The first finite value establishes the baseline and contributes zero.
//  • Positive forward deltas are accumulated.
//  • Negative deltas are resets / re-baselines — never subtracted; accumulation continues from the
//    new baseline.
//  • Missing / non-finite samples are ignored (they create no fake increment).
//  • All-missing input returns null (unavailable), never 0.
export function cumulativeForwardTotal(values: (number | undefined | null)[]): number | null {
  let total = 0
  let prev: number | null = null
  let seen = false
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    seen = true
    if (prev !== null) {
      const delta = v - prev
      if (delta > 0) total += delta // negative delta = reset/re-baseline, contributes nothing
    }
    prev = v
  }
  return seen ? total : null
}
