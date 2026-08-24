// Data-health analysis for the post-import summary.
//
// Turns the imported log into a ranked list of findings so the user understands what the data
// can and can't support BEFORE being dropped into a dense dashboard. Every check is technical
// and conservative — we describe what we can actually measure, name the feature affected, and
// suggest an action, without inventing diagnostic certainty.

import type { DataPoint, MetricConfig } from "@/types/obd"
import type { CRUCIAL_PIDS } from "@/lib/constants"
import { safeMax } from "@/lib/stats"
import { analyzeTimestamps } from "@/lib/timestamps"
import { MAX_GAP_SECONDS } from "@/lib/playback"

export type HealthSeverity = "critical" | "warning" | "info"

export interface HealthFinding {
  id: string
  severity: HealthSeverity
  title: string
  detail: string
  /** Which feature/section is affected. */
  affects?: string
  /** What the user can do about it. */
  action?: string
}

export interface MissingPidsResult {
  missing: typeof CRUCIAL_PIDS
  hasCriticalMissing: boolean
}

/** Classify each metric column as empty (all zero/absent) or constant (present but unchanging). */
function classifyChannels(data: DataPoint[], metrics: MetricConfig[]): { empty: string[]; constant: string[] } {
  const empty: string[] = []
  const constant: string[] = []
  for (const metric of metrics) {
    const key = metric.key as string
    let allEmpty = true
    let firstVal: number | null = null
    let varies = false
    for (const point of data) {
      const v = (point as Record<string, unknown>)[key]
      const num = typeof v === "number" ? v : NaN
      if (!(num === 0 || num == null || isNaN(num))) allEmpty = false
      if (typeof num === "number" && !isNaN(num)) {
        if (firstVal === null) firstVal = num
        else if (num !== firstVal) varies = true
      }
    }
    if (allEmpty) empty.push(metric.label)
    else if (!varies && firstVal !== null) constant.push(metric.label)
  }
  return { empty, constant }
}

export function analyzeDataHealth(
  data: DataPoint[],
  metrics: MetricConfig[],
  missingPIDs: MissingPidsResult,
  speedUnit: "km/h" | "mph" = "km/h",
): HealthFinding[] {
  const findings: HealthFinding[] = []
  if (data.length === 0) return findings

  // --- Missing crucial PIDs -------------------------------------------------
  if (missingPIDs.hasCriticalMissing) {
    findings.push({
      id: "missing-critical",
      severity: "critical",
      title: "Essential channels missing",
      detail: `Missing: ${missingPIDs.missing.map((p) => p.name).join(", ")}. Engine RPM or Vehicle Speed is absent.`,
      affects: "Performance, gear estimation, acceleration runs",
      action: "Enable these PIDs in your logging app and re-record.",
    })
  } else if (missingPIDs.missing.length > 0) {
    findings.push({
      id: "missing-optional",
      severity: "warning",
      title: `${missingPIDs.missing.length} recommended channel${missingPIDs.missing.length > 1 ? "s" : ""} missing`,
      detail: missingPIDs.missing.map((p) => p.name).join(", "),
      affects: [...new Set(missingPIDs.missing.flatMap((p) => p.tabs))].join(", "),
      action: "Add these PIDs in your logger for fuller analysis.",
    })
  }

  // --- Timestamps -----------------------------------------------------------
  // Trust, quality and continuity are separate concerns (see lib/timestamps.ts). Duplicate and
  // gap findings are reported even when the elapsed axis stays trusted.
  const ts = analyzeTimestamps(data.map((d) => d.timestamp))
  if (!ts.parseable || ts.allBareNumbers) {
    findings.push({
      id: "timestamps-unparseable",
      severity: "warning",
      title: "No reliable timestamps",
      detail: "This log's time column isn't a real clock, so positions are shown as sample numbers.",
      affects: "Elapsed time, acceleration timing",
      action: "Enable timestamp logging in your app for accurate timing.",
    })
  } else if (!ts.monotonic) {
    findings.push({
      id: "timestamps-nonmonotonic",
      severity: "warning",
      title: "Timestamps go backwards",
      detail: "Some rows have an earlier timestamp than the one before them, so elapsed time isn't reliable.",
      affects: "Elapsed time, acceleration timing",
    })
  }
  // Quality findings apply whenever timestamps parsed, trusted or not.
  if (ts.parseable && !ts.allBareNumbers) {
    if (ts.duplicateCount > 0) {
      findings.push({
        id: "timestamps-duplicate",
        severity: "info",
        title: `${ts.duplicateCount} duplicate timestamp${ts.duplicateCount > 1 ? "s" : ""}`,
        detail: "Multiple samples share the same timestamp — playback advances across them instantly and the effective sampling rate is uneven.",
        affects: "Sampling rate accuracy",
      })
    }
    if (ts.gapCount > 0) {
      findings.push({
        id: "timestamps-gaps",
        severity: "warning",
        title: `${ts.gapCount} recording gap${ts.gapCount > 1 ? "s" : ""}`,
        detail: `Largest gap ~${ts.largestGapSeconds.toFixed(1)}s versus a typical ${ts.medianDtSeconds?.toFixed(2)}s cadence. Playback skips across gaps longer than ${MAX_GAP_SECONDS}s so it never appears frozen.`,
        affects: "Charts and distance skip across gaps",
      })
    }
  }

  // --- Channel quality ------------------------------------------------------
  const { empty, constant } = classifyChannels(data, metrics)
  if (empty.length > 0) {
    findings.push({
      id: "channels-empty",
      severity: "info",
      title: `${empty.length} empty channel${empty.length > 1 ? "s" : ""}`,
      detail: empty.slice(0, 8).join(", ") + (empty.length > 8 ? "…" : ""),
      affects: "These channels are all-zero and hidden by default",
    })
  }
  if (constant.length > 0) {
    findings.push({
      id: "channels-constant",
      severity: "info",
      title: `${constant.length} constant channel${constant.length > 1 ? "s" : ""}`,
      detail: constant.slice(0, 8).join(", ") + (constant.length > 8 ? "…" : ""),
      affects: "A sensor reporting a fixed value may be unsupported by the vehicle",
    })
  }

  // --- Outliers (conservative) ---------------------------------------------
  // Use the reduce-based safeMax (never Math.max(...bigArray), which overflows the call
  // stack on large logs). data is non-empty here (early return above guards length 0).
  const maxRpm = Math.max(0, safeMax(data.map((d) => (typeof d.rpm === "number" && !isNaN(d.rpm) ? d.rpm : 0))))
  if (maxRpm > 12000) {
    findings.push({
      id: "outlier-rpm",
      severity: "info",
      title: "Implausible RPM values",
      detail: `Peak RPM reads ${Math.round(maxRpm)}, which is unusually high and may be noise.`,
      affects: "Max RPM statistic, gear estimation",
    })
  }
  const speedCap = speedUnit === "mph" ? 250 : 400
  const maxSpeed = Math.max(0, safeMax(data.map((d) => (typeof d.speed === "number" && !isNaN(d.speed) ? d.speed : 0))))
  if (maxSpeed > speedCap) {
    findings.push({
      id: "outlier-speed",
      severity: "info",
      title: "Implausible speed values",
      detail: `Peak speed reads ${Math.round(maxSpeed)} ${speedUnit}, which looks like a spike.`,
      affects: "Max speed statistic, acceleration runs",
    })
  }

  // --- GPS ------------------------------------------------------------------
  const gpsFixes = data.filter(
    (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
  ).length
  if (gpsFixes === 0) {
    findings.push({
      id: "gps-absent",
      severity: "info",
      title: "No GPS data",
      detail: "This log has no location fixes, so the route map is unavailable.",
      affects: "Route map, elevation profile",
    })
  } else if (gpsFixes < data.length * 0.5) {
    findings.push({
      id: "gps-sparse",
      severity: "info",
      title: "Sparse GPS coverage",
      detail: `Only ${gpsFixes} of ${data.length} samples have a location fix.`,
      affects: "Route map may show dropouts",
    })
  }

  const severityRank: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
}

/** Compact counts for a health summary badge. */
export function summarizeHealth(findings: HealthFinding[]): {
  critical: number
  warning: number
  info: number
} {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  }
}
