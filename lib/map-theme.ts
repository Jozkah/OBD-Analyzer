import type { MapStyle } from "@/types/obd"
import { TELEMETRY } from "@/lib/chart-theme"

// Centralised, theme-aware palette for the GPS route CANVAS. A 2D canvas context can't resolve CSS
// `var()` tokens, so — exactly like getChartTheme for Recharts — we hand it concrete colour strings
// chosen per theme. Keeping them here (rather than sprinkled through the draw code) makes the map's
// markers, casings and backdrops a single, reviewable source of truth that mirrors the design
// tokens, and keeps the start/live markers in step with the telemetry palette.

export type ThemeMode = "light" | "dark"

export interface MapTheme {
  /** Dark casing drawn under the coloured track so it stays legible over imagery. */
  trackCasing: string
  /** Track colour when speed has no usable variation (per base style). */
  neutralTrack: string
  /** Start marker fill (shares the telemetry "speed" hue). */
  startMarker: string
  /** Finish marker fill. */
  finishMarker: string
  /** Text drawn inside the S/F markers. */
  markerText: string
  /** Live playback-position marker fill (shares the telemetry "rpm" hue). */
  liveMarker: string
  /** Ring around the live marker. */
  liveMarkerRing: string
  /** Offline backdrop vertical gradient stops [top, bottom]. */
  offlineGradient: [string, string]
  /** Offline grid lines. */
  offlineGrid: string
  /** Fill shown behind map tiles before/if they load. */
  tileBackdrop: string
}

export function getMapTheme(theme: ThemeMode, mapStyle: MapStyle): MapTheme {
  const light = theme === "light"
  return {
    trackCasing: "rgba(0,0,0,0.45)",
    // A blue reads well on street tiles; a bright cyan reads well over satellite/terrain imagery.
    neutralTrack: mapStyle === "street" ? "#1d4ed8" : "#67e8f9",
    startMarker: TELEMETRY.speed,
    finishMarker: "#1f2937",
    markerText: "#ffffff",
    liveMarker: TELEMETRY.rpm,
    liveMarkerRing: "#ffffff",
    offlineGradient: light ? ["#eef2f8", "#e2e8f0"] : ["#0f172a", "#0b1222"],
    offlineGrid: light ? "#cbd5e1" : "#1e293b",
    tileBackdrop: light ? "#e2e8f0" : "#0b1222",
  }
}
