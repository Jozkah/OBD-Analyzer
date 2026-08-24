import type React from "react"

// Centralised, theme-aware chart styling. Recharts renders stroke/fill as SVG attributes,
// which don't resolve CSS `var()`, so we hand it concrete colour strings chosen per theme.
// Values here mirror the --chart-* tokens in globals.css — keep the two in sync.

export type ThemeMode = "light" | "dark"

export interface ChartTheme {
  /** Cartesian grid stroke. */
  grid: string
  /** Axis line + tick label colour. */
  axis: string
  /** Tooltip popover surface (passed to every <Tooltip contentStyle>). */
  tooltipContentStyle: React.CSSProperties
}

export function getChartTheme(theme: ThemeMode): ChartTheme {
  if (theme === "light") {
    return {
      grid: "#dbe3ee", // --chart-grid (light)
      axis: "#5b6472", // --chart-axis (light)
      tooltipContentStyle: {
        backgroundColor: "#ffffff",
        border: "1px solid #d0d7e2",
        borderRadius: "10px",
        color: "#0f172a",
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
      },
    }
  }
  return {
    grid: "#222a3c", // --chart-grid (dark), matches the original look
    axis: "#7e899c", // --chart-axis (dark)
    tooltipContentStyle: {
      backgroundColor: "#11141d",
      border: "1px solid #273043",
      borderRadius: "10px",
      color: "#e5e7eb",
    },
  }
}

/**
 * Named telemetry series colours — the single source of truth for the fixed channels drawn
 * directly by the Performance/Engine charts (and their axis labels). Dynamic PID metrics keep
 * their own per-metric colour from the parser so a chart line always matches its legend swatch.
 * These saturated hues stay legible on both the light and dark plot surfaces.
 */
export const TELEMETRY = {
  rpm: "#ef4444",
  speed: "#22c55e",
  throttle: "#eab308",
  brake: "#f97316",
  boost: "#06b6d4",
  power: "#ec4899",
  torque: "#84cc16",
  gear: "#b666d2",
  fuel: "#f59e0b",
  ignition: "#06b6d4",
  altitude: "#22c55e",
  /** Idle-zone overlay band. */
  idle: "#ef4444",
} as const

/**
 * Temperature-sensor series colours — the single source of truth for the multi-sensor temperature
 * chart (each hue distinct and legible on both plot surfaces). Kept here rather than inline in the
 * session hook so every temperature swatch/line/legend reads from one place.
 */
export const TEMP_SENSORS: { key: string; label: string; color: string }[] = [
  { key: "coolantTemp", label: "Coolant", color: "#8b5cf6" },
  { key: "intakeTemp", label: "Intake Air", color: "#06b6d4" },
  { key: "catTemp", label: "Catalyst", color: "#f59e0b" },
  { key: "oilTemp", label: "Oil", color: "#ef4444" },
  { key: "transTemp", label: "Transmission", color: "#84cc16" },
  { key: "exhaustTemp", label: "Exhaust", color: "#ec4899" },
]
