// Time semantics for playback and axes.
//
// A log's per-sample "time" field is just the row INDEX, not a clock. Real elapsed time is only
// available when the timestamp column parses to a monotonic, sanely-spaced series (the same
// definition acceleration timing already relies on). This module centralises that distinction so
// the UI never labels a sample index as "time".

import { parseLogTimeSeconds } from "@/lib/accel-runs"

export interface TimeAxis {
  /** True when the log carries trustworthy per-sample clock timestamps. */
  trustworthy: boolean
  /** Elapsed seconds for each sample (0-based). When untrustworthy this falls back to the
   *  sample index so callers always have a usable array, but should label it "sample". */
  elapsed: number[]
  /** Total elapsed seconds across the whole log, or null when timestamps aren't trustworthy. */
  totalSeconds: number | null
}

export function computeTimeAxis(timestamps: Array<string | undefined | null>): TimeAxis {
  const elapsed = parseLogTimeSeconds(timestamps)
  if (elapsed) {
    return { trustworthy: true, elapsed, totalSeconds: elapsed[elapsed.length - 1] }
  }
  // Fallback: index-as-position. Not real time — callers show "sample N" labels instead.
  return {
    trustworthy: false,
    elapsed: timestamps.map((_, i) => i),
    totalSeconds: null,
  }
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
