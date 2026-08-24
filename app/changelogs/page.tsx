"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type ChangeType = "feature" | "bugfix" | "improvement" | "breaking"

interface ChangelogEntry {
  version: string
  date: string
  title: string
  type: ChangeType
  description: string[]
}

const changelogs: ChangelogEntry[] = [
  {
    version: "3.0.4",
    date: "2026-08-24",
    title: "Correctness Pass 4: Trip-Counter Baselines, Stuck-Counter Safety & Real Hover Sync",
    type: "bugfix",
    description: [
      "Fixed the synchronized channel-inspector hover, which was silently broken under Recharts 3: the library now reports the active point as a string index with no payload, so the old numeric-only mapping never fired. A hover now correctly resolves a downsampled/sliced chart point back to its original log row across both synced charts",
      "Trip Fuel and Trip Duration totals now exclude the initial baseline: a log captured mid-trip (e.g. cumulative fuel 5.0→5.2 L) reports the 0.2 L actually recorded in the window, not 5.2 L — which also corrects the derived L/100km",
      "A stuck Trip Distance counter (all-zero or constant) while the speed trace clearly shows movement but timestamps are untrusted now reports distance as unavailable rather than an authoritative 0 km; a genuinely stationary log still reports an available zero",
      "The sharing-enabled end-to-end tests now run against a real production build (with the flag baked in at build time, in an isolated output directory), not a dev server — proving the build-time gate, with the API still mocked so CI needs no live backend",
    ],
  },
  {
    version: "3.0.3",
    date: "2026-08-24",
    title: "Final Corrections: Summary Units, Trip-Counter Safety & Rendered Coverage",
    type: "bugfix",
    description: [
      "Session Summary distance now uses the same physically-correct distance helper as the charts — a miles trip channel is converted to kilometres (never relabelled), and when no trip channel exists but timestamps and speed are trustworthy the summary shows the integrated distance instead of “unavailable”",
      "Fuel economy is computed strictly from litres and kilometres (gallons are converted); if the imported fuel or distance unit can’t support L/100km the figure is hidden rather than shown wrong",
      "An unusable Trip Distance channel (all-zero, constant, or mostly-missing) no longer overrides a valid speed/time integration and reports zero distance for a real drive — the counter is classified first, and a genuinely stationary constant-zero counter is still trusted",
      "Each chart is downsampled against the x-domain it actually renders (elapsed time, sample index, or cumulative distance for Overview distance mode); idle zones are detected on the full, non-downsampled data so a short idle can’t vanish",
      "Sparse GPS: a missing speed is treated as unknown (not 0) so it can’t drag the legend or paint a fix as stopped, and the live marker holds the most recent valid fix at/before the current sample instead of jumping to a future one — marker and speed readout always describe the same sample",
      "Removed the client-side localStorage sharing override; NEXT_PUBLIC_SHARING_ENABLED is the sole authority, and the enabled share + shared-link-loading flows are tested against a dedicated sharing-on build with the API mocked",
      "Added rendered-interaction coverage: chart hover maps a downsampled/sliced point back to the correct original row across synced charts, the remaining playback keyboard/range paths assert exact sample positions, and the transmission dialog’s close paths plus responsive edge states are checked with real no-overflow assertions",
    ],
  },
  {
    version: "3.0.2",
    date: "2026-08-24",
    title: "Correctness Pass 2: Physical Accuracy & Behavioural Tests",
    type: "bugfix",
    description: [
      "Distance is now physically correct: speed is integrated over the real per-sample time (trapezoidal), units are normalised (km/h or mph), and when there's no trustworthy clock or trip-distance channel the app reports distance as unavailable rather than guessing a cadence",
      "Separated timestamp handling into distinct policies — axis trust (for the time axis), quality findings (duplicates, gaps), and playback gap-capping — so a log can be trustworthy for plotting while still surfacing its quality issues",
      "Chart downsampling (LTTB) now selects points against the plotted x-domain (elapsed seconds), so irregularly-sampled logs keep the right shape; hover still maps back to the original sample",
      "Transmission dialog uses proper draft form values: blank/invalid entries are shown and validated (with field-level, accessible errors) instead of being silently replaced by defaults; imported and saved configurations are validated against the full schema before use, and presets / imports / auto-detect only fill the draft until you Apply",
      "Multi-file merge compares quoted headers correctly, and an incompatible batch no longer disturbs an already-loaded session",
      "Playback behaviour is now covered by fake-clock tests (rate scaling, irregular sampling, duplicate timestamps, capped gaps, untrusted fallback, pause/resume, seek, range-end rewind); GPS numeric readouts, the semantic shift indicator, the share flow, and a CI-enforced no-horizontal-overflow check across widths and themes are all tested too",
    ],
  },
  {
    version: "3.0.1",
    date: "2026-08-24",
    title: "Correctness & QA Hardening",
    type: "bugfix",
    description: [
      "Playback now advances by real elapsed time: each step consumes the true gap between samples (scaled by the 0.5×–4× speed), instead of assuming a fixed 10 Hz cadence — with capped recording gaps and a clearly-labelled sample-based fallback when timestamps aren't trustworthy",
      "Charts plot against elapsed seconds (labelled “Time”) when timestamps are reliable, or the sample index (labelled “Sample”) otherwise — never mislabelling a row number as time; hover still maps to the correct original sample after downsampling",
      "Restored the shift recommendation (upshift / downshift / hold, with the reason) in the playback bar, shown with an icon and text rather than colour alone",
      "Fixed the effective sampling-rate figure (N−1 intervals over the duration) and the GPS speed unit label so it matches the value (km/h or mph)",
      "Made data-health analysis safe on very large logs (no call-stack overflow), and the transmission dialog transactional — edits stay in a draft until Apply, Cancel discards, and closing with unsaved changes asks first",
      "Completed the semantic-colour pass (playback readouts, idle overlays), added accessible names to the collapsed navigation, and added an ESLint setup plus Playwright end-to-end tests to CI",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-08-23",
    title: "Workspace Redesign: Summary, Data Health & Responsive Shell",
    type: "improvement",
    description: [
      "Redesigned the app into a responsive telemetry workspace — a left navigation rail on desktop and a compact bottom navigation on mobile, so the primary sections no longer wrap into multiple rows of tabs",
      "New post-import Session Summary and Data Health panels: duration, distance, max/avg speed & RPM, boost peak, temperature ranges, sample count, effective sampling rate, GPS coverage and detected units — plus flagged issues (missing PIDs, unreliable/duplicate timestamps, recording gaps, empty/constant channels, outliers, GPS dropouts) with the feature each affects",
      "Honest playback time: the playback bar now shows real elapsed time when the log has trustworthy timestamps, and explicitly labels the position as a sample index when it doesn't — a sample number is never called 'time'. Added 0.5×/1×/2×/4× playback speed",
      "Overview chart gained channel presets, search-to-add and removable colour chips, replacing the permanently-tall PID checkbox panel",
      "PID Analysis became a searchable, filterable Data Channels explorer with per-channel min/max/current, sparklines, a health status, pinning and a multi-select synced inspector",
      "Completed the design system: light and dark themes are now built entirely on semantic tokens (status, chart grid/axis/tooltip, sidebar, telemetry series) with no hardcoded-theme failures — the transmission dialog, charts and the offline GPS backdrop all adapt",
      "Made the transmission configuration responsive and usable on mobile, with predicted speed per gear at the shift RPM and a reset confirmation",
      "Under the hood: the ~2,800-line main file was split into a useObdSession hook and focused feature components (app/page.tsx is now a thin shell), with new unit tests and a Playwright end-to-end suite covering the primary workflow on desktop and mobile",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-07-13",
    title: "Performance & Maintainability",
    type: "improvement",
    description: [
      "Smoother playback: the overview chart no longer re-renders on every playback frame — only the moving readout updates — so scrubbing and playing a large log stays fluid",
      "Faster, lighter GPS map: the map now redraws only the moving position marker on each frame instead of repainting the whole route and map tiles, and the map code is split into its own bundle that loads only when you open the GPS tab",
      "Faster CSV loading: column detection is computed once per file instead of re-scanning every column on every row, so large logs import more quickly",
      "Lighter 'Apply' in the transmission dialog — applying a configuration now only touches the rows whose gear actually changes",
      "Under the hood: the ~4,700-line main file was split into focused, unit-tested modules (number parsing, gear math, GPS projection, exports, the map component, and more), making the app easier to maintain and safer to change",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-07-13",
    title: "Light Theme, Mobile Fixes, New Views & Offline Support",
    type: "feature",
    description: [
      "New: a light/dark theme toggle in the app bar — the dark 'instrument cluster' look is still the default, with a new daylight theme that follows your system preference and remembers your choice (charts, tooltips and scrollbars all adapt)",
      "New: an Acceleration panel on the Performance tab showing your best 0–100 km/h, 0–60 mph and ¼-mile (with trap speed), timed from the log's real per-sample timestamps — it only appears when a log has trustworthy timestamps, so the numbers are never guessed",
      "New: a distance-based X-axis option on the overview chart (plot against distance travelled instead of sample index) and an elevation profile chart on the GPS tab, drawn from the log's altitude",
      "New: export the overview chart as a PNG, completing the export set alongside the existing CSV and GPS-map-PNG exports",
      "New: the app is now an installable PWA that works offline — add it to your home screen / install it, and it keeps working with no connection once loaded",
      "Fixed mobile layout: charts no longer collapse to zero height on phones (the General Overview chart was invisible), and the tab bar now wraps so every tab stays visible instead of scrolling off-screen",
      "More accurate number parsing: logs that write thousands-separated integers (e.g. RPM '3,500') are now detected per-file and read correctly, without regressing European decimal logs",
      "Safety: opening a shared-log link now asks for confirmation before loading, instead of silently pulling remote content into the analyzer",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-07-13",
    title: "Reliability, Security, Accessibility & Performance Overhaul",
    type: "improvement",
    description: [
      "Fixed the GPS track failing to render for datalog.help / OBDLink logs — GPS coordinates written with an escaped decimal (e.g. 01\\.44) were being truncated to whole numbers, collapsing the whole route to a single point; the map, and the bundled sample log, now draw correctly",
      "Stopped text/status columns (fuel-system status, oxygen-sensor location, OBD certification, etc.) from appearing as empty zero-valued metrics in the PID list",
      "Corrected gear-ratio auto-detection and the Trip Duration readout for mph / seconds-based logs, and multi-file merges now refuse to silently mix columns logged in different units (km/h vs mph, bar vs psi)",
      "Malformed CSV files now show a clear error and reset to a clean state instead of failing silently with a disappearing spinner",
      "Hardened the optional Share feature: per-IP rate limiting, same-site-only writes, a CSV-shape check on uploads, and site-wide security headers (Content-Security-Policy, X-Frame-Options, and more)",
      "Accessibility pass (WCAG AA): stronger text contrast, screen-reader names on every icon button and form field, live-region announcements for toasts and loading, and support for the reduced-motion preference",
      "Performance: memoized several heavy per-render calculations (PID list filtering, gear distribution, GPS point count) so large logs and playback stay smooth",
      "New: keyboard shortcuts for playback — Space to play/pause, ← / → to step (Shift for a bigger jump), Home / End to jump to the range ends",
      "Added an automated test suite and continuous-integration checks, plus richer link previews (OpenGraph / Twitter cards) when sharing the site",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-06-10",
    title: "Interactive GPS Map: Real Basemaps + Pan & Zoom",
    type: "feature",
    description: [
      "Added optional real basemaps to the GPS Track tab — Satellite (Esri), Street (OpenStreetMap) and Terrain (OpenTopoMap) — rendered under your route",
      "The track is now pannable (drag) and zoomable (scroll wheel, or on-map + / − / fit controls), reprojected with Web Mercator so it lines up with the map",
      "Defaults to an 'Offline' basemap that makes no network requests; real basemaps are opt-in and only then fetch map tiles",
      "No API keys required, and tile providers are attributed on the map",
    ],
  },
  {
    version: "1.8.1",
    date: "2026-06-10",
    title: "GPS Track Accuracy & Stationary-Log Handling",
    type: "bugfix",
    description: [
      "Fixed the GPS track projection — the route now keeps its true shape (a single uniform scale, with longitude compressed by latitude) instead of being stretched independently on each axis into a full-canvas zig-zag",
      "Stationary logs (all GPS fixes within ~20 m) now show a clear 'No track to plot' message instead of a blank map with a single centered dot",
      "Polished the track rendering with rounded joins and a soft glow underlay so the route reads clearly",
      "Moved the local dev/start server to port 3210 to avoid clashing with other projects on 3000",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-06-10",
    title: "Shareable, Expiring Log Links",
    type: "feature",
    description: [
      "Added an optional Share button that creates a short link to the current log, which expires automatically (24h by default)",
      "Opening a share link loads the log straight into the dashboard — handy for sending a drive to someone or pulling it up on another device",
      "The feature is off unless a deployer configures it; with it off the app stays 100% client-side and nothing leaves the browser",
      "Shared logs are stored gzipped behind a server-side route handler with a random, non-enumerable id; the browser never sees any database credentials",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-06-10",
    title: "Full Visual Redesign + Major QA Bug-Fix Pass",
    type: "improvement",
    description: [
      "Redesigned the entire UI as a dark 'instrument cluster' theme — a proper hero upload screen, sticky app bar, segmented tabs, and tabular-figure readouts that no longer jitter as values update",
      "Hardened CSV parsing to be fully quote-aware, so quoted fields containing commas no longer corrupt the imported data",
      "Removed the build-time error suppression and tightened the transmission/gear configuration types — the build now fails on real type errors instead of hiding them",
      "Fixed 40+ confirmed bugs found in a multi-agent QA pass, spanning chart rendering, number parsing, gear-ratio detection and GPS handling",
      "Corrected gear estimation to account for km/h vs mph speed units",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-04-02",
    title: "Major Cleanup, Bug Fixes & Quality of Life",
    type: "improvement",
    description: [
      "Added idle zone overlays on all 11 charts when 'Ignore Idle' is checked",
      "Added toast notifications for transmission config changes",
      "Added error boundaries to prevent chart crashes from breaking the whole page",
      "All tabs now visible on mobile via horizontal scroll",
      "Fixed boost Y-axis showing raw floats like '1.6199999999999999'",
      "Fixed tooltip values showing excessive decimals across all charts",
      "Fixed regex bug in column name shortening",
      "Fixed crash risk on large datasets from Math.max/min spread",
      "Removed fake brake data, dead components, unused constants",
      "Added proper TypeScript types throughout",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-02-23",
    title: "CSV Format Compatibility & Next.js Upgrade",
    type: "improvement",
    description: [
      "Fixed CSV parsing to support 2024 format with comment lines (# prefix)",
      "Fixed speed field mapping to prevent 'Max Speed' from overwriting real-time speed data in Performance tab",
      "Added support for both European (comma) and American (period) decimal separators",
      "Upgraded Next.js from 14.2.16 to 14.2.35 for improved performance and security",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-01-22",
    title: "Average Speed, RPM & PID Reliability",
    type: "improvement",
    description: [
      "Added average speed and RPM display to the overview page",
      "Fixed issues with Speed PID reporting static values in graphs",
      "Added detection for null or corrupt PIDs with user warnings for missing crucial data",
    ],
  },
  {
    version: "1.4.1",
    date: "2025-12-30",
    title: "International Support & Data Processing",
    type: "improvement",
    description: [
      "Added automatic unit detection for km/h and mph",
      "Supported comma and period decimal formats",
      "Improved max speed calculation with smart fallbacks",
      "Enhanced CSV parsing and data handling for edge cases",
    ],
  },
  {
    version: "1.4.0",
    date: "2025-12-30",
    title: "Drag and Drop, Smarter Statistics & PID Enhancements",
    type: "feature",
    description: [
      "Added drag-and-drop support for CSV uploads",
      "Improved statistics by filtering invalid values",
      "Enhanced PID selection to enable valid metrics by default",
      "Added consistent decimal formatting with formatValue()",
      "Refined session statistics for better accuracy",
    ],
  },
  {
    version: "1.3.0",
    date: "2025-06-09",
    title: "Mobile Responsiveness & Gearbox Improvements",
    type: "improvement",
    description: [
      "Fixed mobile appearance of the app for better usability on small screens",
      "Improved gearbox detection algorithm to properly identify all gears",
      "Enhanced gear distribution visualization",
      "Added responsive layout adjustments for different screen sizes",
    ],
  },
  {
    version: "1.2.0",
    date: "2025-06-07",
    title: "Tire Size Calculator & Transmission Configuration",
    type: "feature",
    description: [
      "Added tire size calculator within transmission configuration dialog",
      "Implemented custom transmission configuration options",
      "Added more transmission presets for common vehicles",
      "Fixed various typos and UI inconsistencies",
    ],
  },
  {
    version: "1.1.0",
    date: "2025-06-05",
    title: "Metrics Panel Enhancements",
    type: "feature",
    description: [
      "Added search functionality to metrics panel",
      "Implemented scrollbar for metrics panel when there are more than 20 metrics",
      "Added sorting options (alphabetical and import order)",
      "Improved metric name abbreviations for better readability",
      "Fixed scrolling behavior to only scroll the metrics list",
    ],
  },
  {
    version: "1.0.0",
    date: "2025-06-01",
    title: "Initial Release",
    type: "feature",
    description: [
      "First public release of OBD Analyzer",
      "CSV data import and parsing",
      "Basic automotive metrics visualization",
      "GPS track visualization",
      "PID analysis capabilities",
      "Overview dashboard with key metrics",
    ],
  },
]

const TYPE_META: Record<ChangeType, { label: string; badge: string }> = {
  feature: { label: "Feature", badge: "bg-success/15 text-success border border-success/30" },
  improvement: { label: "Improvement", badge: "bg-info/15 text-info border border-info/30" },
  bugfix: { label: "Fix", badge: "bg-danger/15 text-danger border border-danger/30" },
  breaking: { label: "Breaking", badge: "bg-warning/15 text-warning border border-warning/30" },
}

const FILTERS: ("all" | ChangeType)[] = ["all", "feature", "improvement", "bugfix", "breaking"]

function humanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
}

function Badge({ type }: { type: ChangeType }) {
  const meta = TYPE_META[type]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Version {entry.version}</h3>
          <Badge type={entry.type} />
        </div>
        <time className="text-sm text-muted-foreground">{humanDate(entry.date)}</time>
      </div>
      <h4 className="mt-2 font-medium">{entry.title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {entry.description.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground">{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function ChangelogsPage() {
  const [filter, setFilter] = useState<"all" | ChangeType>("all")
  const [showOlder, setShowOlder] = useState(false)

  const filtered = useMemo(
    () => (filter === "all" ? changelogs : changelogs.filter((c) => c.type === filter)),
    [filter],
  )
  const [latest, ...older] = filtered

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-col gap-6">
        <Link
          href="/"
          className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Changelog</h1>
          <p className="mt-1 text-muted-foreground">A complete history of updates to OBD Analyzer.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilter(f); setShowOlder(false) }}
              aria-pressed={filter === f}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                filter === f ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : TYPE_META[f].label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground">No entries of this type.</p>
        ) : (
          <>
            {/* Latest release, highlighted */}
            {latest && (
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">Latest</span>
                  </div>
                  <CardTitle className="sr-only">Latest release</CardTitle>
                  <CardDescription className="sr-only">The most recent release</CardDescription>
                </CardHeader>
                <CardContent>
                  <Entry entry={latest} />
                </CardContent>
              </Card>
            )}

            {/* Older releases, collapsible */}
            {older.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowOlder((s) => !s)}
                  aria-expanded={showOlder}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showOlder ? "" : "-rotate-90"}`} />
                  {showOlder ? "Hide" : `Show ${older.length} earlier release${older.length > 1 ? "s" : ""}`}
                </button>
                {showOlder && (
                  <Card className="mt-3">
                    <CardContent className="space-y-8 pt-6">
                      {older.map((entry, i) => (
                        <div key={entry.version} className="space-y-0">
                          <Entry entry={entry} />
                          {i < older.length - 1 && <Separator className="mt-6" />}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
