import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface ChangelogEntry {
  version: string
  date: string
  title: string
  type: "feature" | "bugfix" | "improvement" | "breaking"
  description: string[]
}

const changelogs: ChangelogEntry[] = [
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
      "Enhanced CSV parsing and data handling for edge cases"
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
      "Refined session statistics for better accuracy"
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
      "First public release of the Automotive Data Analyzer",
      "CSV data import and parsing",
      "Basic automotive metrics visualization",
      "GPS track visualization",
      "PID analysis capabilities",
      "Overview dashboard with key metrics",
    ],
  },
]

const getBadgeColor = (type: string) => {
  switch (type) {
    case "feature":
      return "bg-green-500 hover:bg-green-600"
    case "bugfix":
      return "bg-red-500 hover:bg-red-600"
    case "improvement":
      return "bg-blue-500 hover:bg-blue-600"
    case "breaking":
      return "bg-amber-500 hover:bg-amber-600"
    default:
      return "bg-gray-500 hover:bg-gray-600"
  }
}

export default function ChangelogsPage() {
  return (
    <div className="container mx-auto py-6 px-4 md:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Changelogs</CardTitle>
            <CardDescription>A complete history of updates and changes to the Automotive Data Analyzer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {changelogs.map((changelog, index) => (
                <div key={changelog.version} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">Version {changelog.version}</h3>
                      <Badge className={getBadgeColor(changelog.type)}>
                        {changelog.type.charAt(0).toUpperCase() + changelog.type.slice(1)}
                      </Badge>
                    </div>
                    <time className="text-sm text-muted-foreground">{changelog.date}</time>
                  </div>
                  <h4 className="font-medium">{changelog.title}</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {changelog.description.map((item, i) => (
                      <li key={i} className="text-muted-foreground">
                        {item}
                      </li>
                    ))}
                  </ul>
                  {index < changelogs.length - 1 && <Separator className="mt-6" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
