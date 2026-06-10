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
