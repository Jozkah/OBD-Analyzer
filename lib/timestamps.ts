// Timestamp analysis — the single source of truth for how a log's Time column is interpreted.
//
// Three SEPARATE concerns are derived here, deliberately not conflated:
//
//  1. Elapsed axis / playback trust (`trusted`): can we present real elapsed wall-clock time?
//     Requires parseable, non-decreasing, positive-span timestamps that are NOT bare index
//     placeholders. Duplicate timestamps and large forward gaps DO NOT break this — they are
//     quality findings, not trust-breakers.
//  2. Quality findings (`duplicateCount`, `gapCount`, `largestGapSeconds`): surfaced in Data
//     Health even when the axis is trusted.
//  3. Acceleration continuity: a STRICTER check lives in accel-runs.ts (parseLogTimeSeconds),
//     so a recording gap can never fabricate an acceleration result.

const BARE_NUMBER = /^\s*[-+]?\d+(\.\d+)?\s*$/

export interface TimestampAnalysis {
  /** Every value parsed to a finite absolute time. */
  parseable: boolean
  /** Every value is a bare integer/number → an index placeholder, not a wall clock. */
  allBareNumbers: boolean
  /** No backwards step (duplicates, i.e. dt === 0, are allowed). */
  monotonic: boolean
  /** Suitable for a real elapsed-time axis and time-based playback. */
  trusted: boolean
  /** Elapsed seconds from the first sample. Falls back to the sample index when not trusted. */
  elapsed: number[]
  /** Total span in seconds (last − first), or null when not trusted. */
  spanSeconds: number | null
  /** Median of the positive inter-sample gaps, or null. */
  medianDtSeconds: number | null
  /** Count of consecutive samples sharing the same timestamp (dt === 0). */
  duplicateCount: number
  /** Count of gaps noticeably larger than the typical cadence. */
  gapCount: number
  largestGapSeconds: number
}

export function analyzeTimestamps(raw: Array<string | number | undefined | null>): TimestampAnalysis {
  const n = raw.length
  const indexFallback = Array.from({ length: n }, (_, i) => i)
  const untrusted = (over: Partial<TimestampAnalysis> = {}): TimestampAnalysis => ({
    parseable: false,
    allBareNumbers: false,
    monotonic: false,
    trusted: false,
    elapsed: indexFallback,
    spanSeconds: null,
    medianDtSeconds: null,
    duplicateCount: 0,
    gapCount: 0,
    largestGapSeconds: 0,
    ...over,
  })

  if (n < 2) return untrusted()

  // Bare numbers (e.g. "0","1","2") are index placeholders, not absolute wall-clock times.
  const allBareNumbers = raw.every((t) => typeof t === "number" || (typeof t === "string" && BARE_NUMBER.test(t)))
  if (allBareNumbers) return untrusted({ allBareNumbers: true })

  const ms: number[] = []
  for (const t of raw) {
    if (typeof t !== "string") return untrusted()
    const v = new Date(t).getTime()
    if (!Number.isFinite(v)) return untrusted()
    ms.push(v)
  }

  let monotonic = true
  let duplicateCount = 0
  const dts: number[] = []
  for (let i = 1; i < ms.length; i++) {
    const dt = (ms[i] - ms[i - 1]) / 1000
    if (dt < 0) monotonic = false
    else if (dt === 0) duplicateCount++
    else dts.push(dt)
  }

  const sorted = [...dts].sort((a, b) => a - b)
  const medianDt = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
  let gapCount = 0
  let largestGap = 0
  if (medianDt && medianDt > 0) {
    const threshold = Math.max(medianDt * 4, medianDt + 2)
    for (const dt of dts) {
      if (dt > threshold) gapCount++
      if (dt > largestGap) largestGap = dt
    }
  } else if (dts.length) {
    largestGap = Math.max(...dts)
  }

  const spanSeconds = (ms[ms.length - 1] - ms[0]) / 1000
  // Trusted when it reads as a real, forward-moving wall clock. Duplicates and large gaps are
  // fine here; they surface as quality findings, not as loss of trust.
  const trusted = monotonic && spanSeconds > 0
  const elapsed = trusted ? ms.map((v) => (v - ms[0]) / 1000) : indexFallback

  return {
    parseable: true,
    allBareNumbers: false,
    monotonic,
    trusted,
    elapsed,
    spanSeconds: trusted ? spanSeconds : null,
    medianDtSeconds: medianDt,
    duplicateCount,
    gapCount,
    largestGapSeconds: largestGap,
  }
}
