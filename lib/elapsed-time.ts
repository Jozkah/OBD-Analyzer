// Time semantics for playback and axes.
//
// A log's per-sample "time" field is just the row INDEX, not a clock. Real elapsed time is
// available whenever the timestamp column reads as a forward-moving wall clock — see
// lib/timestamps.ts, which owns the trust decision. Crucially this is SEPARATE from the stricter
// continuity check acceleration timing uses: duplicate timestamps and large recording gaps keep
// a trusted elapsed axis (they only produce Data Health findings), and a valid two-sample log is
// trusted too. This module centralises the distinction so the UI never labels an index as "time".

import { analyzeTimestamps } from "@/lib/timestamps"

export interface TimeAxis {
  /** True when the log carries trustworthy per-sample clock timestamps. */
  trustworthy: boolean
  /** Elapsed seconds for each sample (0-based). When untrustworthy this falls back to the
   *  sample index so callers always have a usable array, but should label it "sample". */
  elapsed: number[]
  /** Total elapsed seconds across the whole log, or null when timestamps aren't trustworthy. */
  totalSeconds: number | null
}

export function computeTimeAxis(timestamps: Array<string | number | undefined | null>): TimeAxis {
  const a = analyzeTimestamps(timestamps)
  if (a.trusted) {
    return { trustworthy: true, elapsed: a.elapsed, totalSeconds: a.spanSeconds }
  }
  // Fallback: index-as-position. Not real time — callers show "sample N" labels instead.
  return { trustworthy: false, elapsed: a.elapsed, totalSeconds: null }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Format a duration in seconds as `M:SS` (or `H:MM:SS` past an hour). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Human label for the playback position at sample `index`.
 * - Trustworthy timestamps → elapsed `M:SS` of the total.
 * - Otherwise → `Sample N / total` so nothing is mislabelled as time.
 */
export function formatPosition(axis: TimeAxis, index: number, lastIndex: number): string {
  if (axis.trustworthy && axis.totalSeconds != null) {
    const at = axis.elapsed[index] ?? 0
    return `${formatDuration(at)} / ${formatDuration(axis.totalSeconds)}`
  }
  return `Sample ${index} / ${lastIndex}`
}

/** Short label for the current position only (no total). */
export function formatPositionShort(axis: TimeAxis, index: number): string {
  if (axis.trustworthy) return formatDuration(axis.elapsed[index] ?? 0)
  return `#${index}`
}
