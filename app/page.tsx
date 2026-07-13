"use client"

import { useMemo } from "react"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  FileText,
  Map,
  BarChart3,
  Search,
  ChevronDown,
  Plus,
  X,
  Settings,
  History,
  AlertTriangle,
  Gauge,
  Share2,
  Copy,
  Check,
  Loader2,
  Download,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  ReferenceArea,
} from "recharts"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import Link from "next/link"
import { ErrorBoundary } from "@/components/error-boundary"
import { parseLogTimeSeconds, detectAccelRuns } from "@/lib/accel-runs"
import type { DataPoint, MetricConfig, TransmissionConfig } from "@/types/obd"
import { safeMax } from "@/lib/stats"
import { lttbDownsample } from "@/lib/downsample"
import { formatValue, tooltipFormatter } from "@/lib/format"
import { buildWindowCsv, downloadCsv, determineFileOrder } from "@/lib/csv"
import { calculateGear, getShiftIndicator, detectGearRatios } from "@/lib/gear"
import { exportTransmissionConfig, importTransmissionConfig } from "@/lib/transmission"
import { calculateTireDiameter, parseTireSize } from "@/lib/tire"
import { exportChartPng } from "@/lib/chart-export"
import { defaultMetrics, CRUCIAL_PIDS } from "@/lib/constants"
import { parseCsvText, type ParseCsvResult } from "@/lib/parse-csv"
import dynamic from "next/dynamic"

// Code-split the GPS map: its canvas + tile logic (and the map projection helpers it pulls
// in) only load when the GPS Track tab is opened, keeping them out of the initial bundle
// (#33). ssr:false because it renders to a <canvas> and reads window/DOM directly.
const GPSTrackMap = dynamic(() => import("@/components/gps-track-map").then((m) => m.GPSTrackMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>
  ),
})

// Code-split the non-default chart tabs too (#33): the Performance and Engine grids (and the
// Recharts config they carry) load only when their tab is first opened, so a visitor who
// stays on the default Overview tab never downloads them. A brief skeleton covers the swap.
const chartTabFallback = () => (
  <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">Loading charts…</div>
)
const PerformanceCharts = dynamic(
  () => import("@/components/performance-charts").then((m) => m.PerformanceCharts),
  { ssr: false, loading: chartTabFallback },
)
const EngineCharts = dynamic(() => import("@/components/engine-charts").then((m) => m.EngineCharts), {
  ssr: false,
  loading: chartTabFallback,
})

// Toggles the optional "share a log via an expiring link" feature. The backend must also
// be configured (see .env.example / README → "Sharing logs"). When false, the Share
// button is hidden and the app stays 100% client-side.
const SHARING_ENABLED = process.env.NEXT_PUBLIC_SHARING_ENABLED === "true"

// parseNumericValue / isNumericCell / detectCommaMeaning now live in lib/parse-number.ts
// so they can be unit-tested in isolation; imported at the top of this file.

// Merge multiple CSV files into a single file, preserving the header from the first file
async function mergeCSVFiles(orderedFiles: File[]): Promise<File> {
  if (orderedFiles.length === 1) return orderedFiles[0]

  const texts = await Promise.all(orderedFiles.map((f) => f.text()))

  // Locate the header line (first non-comment, non-blank line) and where data
  // begins. Use /\r?\n/ so CRLF files split cleanly. dataStart defaults to
  // lines.length so a file with no real header row contributes nothing (this
  // prevents comment-only files from leaking their comment lines in as data).
  const extractHeader = (text: string): { header: string; dataStart: number; lines: string[] } => {
    const lines = text.split(/\r?\n/)
    for (let j = 0; j < lines.length; j++) {
      const trimmed = lines[j].trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      return { header: trimmed, dataStart: j + 1, lines }
    }
    return { header: "", dataStart: lines.length, lines }
  }

  const base = extractHeader(texts[0])

  // Two logs of the SAME channels in the SAME order can still carry cosmetically
  // different header labels — e.g. the OBDLink logger writes "Latitude (deg)" in
  // some sessions and "Latitude" in others. Compare each column by its unit-stripped
  // name so those merge cleanly, while still refusing genuinely different or re-ordered
  // layouts.
  const cellName = (cell: string): string =>
    cell.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
  // The unit (parenthetical suffix), normalized. Empty when the column has no unit.
  const cellUnit = (cell: string): string => {
    const m = cell.match(/\(([^)]*)\)\s*$/)
    return m ? m[1].replace(/\s+/g, "").toLowerCase() : ""
  }

  // Headers are compatible when they have the same column count, matching column names,
  // and — crucially — no column where BOTH sides declare a unit that differs. This still
  // allows "Latitude (deg)" vs "Latitude" (one unit missing) to merge, but refuses
  // "Speed (km/h)" vs "Speed (mph)" or "Boost (bar)" vs "Boost (psi)", which would
  // otherwise silently mix incompatible units into one column with no warning.
  const headersCompatible = (a: string, b: string): boolean => {
    const ca = a.split(",")
    const cb = b.split(",")
    if (ca.length !== cb.length) return false
    for (let k = 0; k < ca.length; k++) {
      if (cellName(ca[k]) !== cellName(cb[k])) return false
      const ua = cellUnit(ca[k])
      const ub = cellUnit(cb[k])
      if (ua && ub && ua !== ub) return false
    }
    return true
  }

  // First file: keep everything (comments + header + data)
  let merged = texts[0].trimEnd()

  // Subsequent files: verify their header matches file[0]'s before appending.
  // Blindly concatenating rows from a file whose columns are re-ordered (or a
  // different shape) would map every channel to the wrong column with no warning,
  // silently corrupting the data. Refuse the merge on any header mismatch.
  for (let i = 1; i < texts.length; i++) {
    const cur = extractHeader(texts[i])
    // An empty/comment-only segment contributes no rows; skip it rather than
    // aborting the whole merge with a "header differs" error.
    if (!cur.header) continue
    if (!headersCompatible(base.header, cur.header)) {
      throw new Error(
        `Cannot merge "${orderedFiles[i].name}": its CSV header differs from "${orderedFiles[0].name}". ` +
          `Files must log the same PIDs in the same order to be merged.`,
      )
    }
    // Only append real data lines — strip any comment/blank lines so they are
    // never appended as if they were data rows.
    const dataLines = cur.lines.slice(cur.dataStart).filter((l) => l.trim() && !l.trim().startsWith("#"))
    if (dataLines.length > 0) {
      merged += "\n" + dataLines.join("\n")
    }
  }

  const blob = new Blob([merged], { type: "text/csv" })
  const mergedName = `${orderedFiles.length} files merged`
  return new File([blob], mergedName, { type: "text/csv" })
}

// Run the pure CSV parse in a Web Worker so large logs don't block the main thread (#29).
// Falls back to a synchronous in-thread parse if a Worker can't be constructed (SSR,
// unsupported environment, or any runtime failure) so parsing always still works.
type WorkerParseResult = ParseCsvResult | { status: "error"; message?: string }
function parseInWorker(text: string, transmissionConfig: TransmissionConfig): Promise<WorkerParseResult> {
  const runSync = (): WorkerParseResult => parseCsvText(text, transmissionConfig)

  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return Promise.resolve(runSync())
  }

  return new Promise<WorkerParseResult>((resolve, reject) => {
    let w: Worker
    try {
      // Path RELATIVE to this file (app/page.tsx) so webpack bundles the worker (#29).
      w = new Worker(new URL("../lib/parse-csv.worker.ts", import.meta.url))
    } catch {
      // Constructing the worker failed outright — parse synchronously instead.
      resolve(runSync())
      return
    }
    w.onmessage = (e: MessageEvent<WorkerParseResult>) => {
      resolve(e.data)
      w.terminate()
    }
    w.onerror = (err) => {
      w.terminate()
      reject(err)
    }
    w.postMessage({ text, transmissionConfig })
  }).catch(() => runSync())
}

export default function AutomotiveAnalyzer() {
  const [data, setData] = useState<DataPoint[]>([])
  const [metrics, setMetrics] = useState<MetricConfig[]>(defaultMetrics)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [timeRange, setTimeRange] = useState([0, 100])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importedFileNames, setImportedFileNames] = useState<string[]>([])
  const [ignoreIdle, setIgnoreIdle] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [searchQuery, setSearchQuery] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transmissionFileInputRef = useRef<HTMLInputElement>(null)
  const [sortOption, setSortOption] = useState<"default" | "alphabetical">("default")
  const [selectedTempSensors, setSelectedTempSensors] = useState<string[]>(["coolantTemp", "intakeTemp"])
  const [selectedPIDs, setSelectedPIDs] = useState<string[]>([])
  const [showEmptyPIDs, setShowEmptyPIDs] = useState(false)
  const [pidAnalysisHoveredTimeKey, setPidAnalysisHoveredTimeKey] = useState<number | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [speedUnit, setSpeedUnit] = useState<"km/h" | "mph">("km/h")
  // Raw unit of the "Trip Duration" column (e.g. "min" or "sec"), captured at parse time
  // so the Trip Duration readout can normalize to minutes instead of assuming minutes.
  const [tripDurationUnit, setTripDurationUnit] = useState<string>("min")

  // --- Sharing (optional; gated by SHARING_ENABLED) ---
  // rawCsv retains the exact text of the loaded log so it can be POSTed to /api/share.
  const [rawCsv, setRawCsv] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [sharedNotice, setSharedNotice] = useState<{ expiresAt: string | null } | null>(null)
  // A ?share=<id> was seen on load and is awaiting the user's confirmation (see #25).
  const [pendingShareId, setPendingShareId] = useState<string | null>(null)
  const sharedLoadedRef = useRef(false)
  const [showMissingPIDsDialog, setShowMissingPIDsDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000)
  }, [])

  // --- Theme (light / dark) ---
  // The pre-hydration script in layout.tsx has already applied the correct class to <html>;
  // here we read it back on mount (so the button shows the right icon) and let the user flip
  // it, persisting the choice under the same "obd-theme" key the script reads.
  // Overview chart X-axis: sample index ("time") or cumulative distance ("distance").
  const [overviewXMode, setOverviewXMode] = useState<"time" | "distance">("time")
  // Wraps the Overview chart's ResponsiveContainer so its SVG can be exported to PNG.
  const overviewChartRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark")
  }, [])
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      const el = document.documentElement
      el.classList.remove("light", "dark")
      el.classList.add(next)
      el.style.colorScheme = next
      try {
        localStorage.setItem("obd-theme", next)
      } catch {
        /* localStorage may be unavailable (private mode); the in-memory toggle still works */
      }
      return next
    })
  }, [])
  // Shared Recharts tooltip surface, theme-aware so the popover reads as a light card in
  // light mode instead of a hard black box. Reused by every chart's <Tooltip contentStyle>.
  const tooltipContentStyle = useMemo<React.CSSProperties>(
    () =>
      theme === "light"
        ? {
            backgroundColor: "#ffffff",
            border: "1px solid #d0d7e2",
            borderRadius: "10px",
            color: "#0f172a",
            boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
          }
        : { backgroundColor: "#11141d", border: "1px solid #273043", borderRadius: "10px" },
    [theme],
  )
  const [missingPIDs, setMissingPIDs] = useState<{ missing: typeof CRUCIAL_PIDS; hasCriticalMissing: boolean }>({
    missing: [],
    hasCriticalMissing: false,
  })
  const [transmissionConfig, setTransmissionConfig] = useState<TransmissionConfig>({
    gearRatios: {
      1: 3.538,
      2: 1.92,
      3: 1.323,
      4: 1.026,
      5: 0.822,
      6: 0.681,
    },
    finalDrive: 4.35,
    tyreDiameterMm: 647,
    shiftRpm: 6900,
    numberOfGears: 6,
  })
  // Persist the transmission configuration across visits — it's the most tedious thing to
  // set up (gear ratios, final drive, tyre diameter). Loaded once on mount (in an effect,
  // not initial state, to avoid an SSR hydration mismatch); saved on change. The save is
  // gated on configLoadedRef so the initial default render can't clobber a stored value
  // before the load runs. Speed unit is auto-detected per file, and map style is local to
  // the GPS component, so neither is persisted here.
  const configLoadedRef = useRef(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("obd.transmissionConfig")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.gearRatios && parsed.finalDrive && parsed.tyreDiameterMm && parsed.numberOfGears) {
          setTransmissionConfig(parsed)
        }
      }
    } catch {
      /* corrupt/unavailable storage — fall back to defaults */
    }
    configLoadedRef.current = true
  }, [])
  useEffect(() => {
    if (!configLoadedRef.current) return
    try {
      localStorage.setItem("obd.transmissionConfig", JSON.stringify(transmissionConfig))
    } catch {
      /* storage full/unavailable — non-fatal */
    }
  }, [transmissionConfig])
  const [transmissionPresets] = useState<{ name: string; config: TransmissionConfig }[]>([
    {
      name: "Peugeot 308 GTi (T9 EA71)",
      config: {
        gearRatios: { 1: 3.358, 2: 1.92, 3: 1.433, 4: 1.103, 5: 0.881, 6: 0.745 },
        finalDrive: 4.176,
        tyreDiameterMm: 647,
        shiftRpm: 6700,
        numberOfGears: 6,
      },
    },
    {
      name: "Peugeot 308 GT (T9 EA65)",
      config: {
        gearRatios: { 1: 3.538, 2: 1.92, 3: 1.323, 4: 1.026, 5: 0.822, 6: 0.681 },
        finalDrive: 4.35,
        tyreDiameterMm: 647,
        shiftRpm: 6900,
        numberOfGears: 6,
      },
    },
    {
      name: "Honda Civic Type R (FK8)",
      config: {
        gearRatios: { 1: 3.267, 2: 1.967, 3: 1.428, 4: 1.073, 5: 0.83, 6: 0.647 },
        finalDrive: 4.785,
        tyreDiameterMm: 645,
        shiftRpm: 7000,
        numberOfGears: 6,
      },
    },
    {
      name: "BMW M3 (F80)",
      config: {
        gearRatios: { 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1.0, 7: 0.839 },
        finalDrive: 3.15,
        tyreDiameterMm: 685,
        shiftRpm: 7200,
        numberOfGears: 7,
      },
    },
    {
      name: "Subaru WRX STI",
      config: {
        gearRatios: { 1: 3.636, 2: 2.235, 3: 1.521, 4: 1.137, 5: 0.971, 6: 0.756 },
        finalDrive: 4.444,
        tyreDiameterMm: 650,
        shiftRpm: 6800,
        numberOfGears: 6,
      },
    },
    {
      name: "Porsche 911 GT3",
      config: {
        gearRatios: { 1: 3.5, 2: 2.118, 3: 1.36, 4: 1.054, 5: 0.853, 6: 0.707 },
        finalDrive: 4.105,
        tyreDiameterMm: 680,
        shiftRpm: 9000,
        numberOfGears: 6,
      },
    },
    {
      name: "Nissan GT-R R35",
      config: {
        gearRatios: { 1: 4.056, 2: 2.301, 3: 1.595, 4: 1.248, 5: 1.001, 6: 0.796 },
        finalDrive: 3.794,
        tyreDiameterMm: 690,
        shiftRpm: 7000,
        numberOfGears: 6,
      },
    },
  ])
  const [autoDetectionResults, setAutoDetectionResults] = useState<any>(null)
  const [showAutoDetection, setShowAutoDetection] = useState(false)
  const [showTransmissionDialog, setShowTransmissionDialog] = useState(false)
  // Accessibility for the (custom, non-Radix) Transmission Configuration modal: trap focus
  // inside it while open, focus the first control on open, close on Escape, and return
  // focus to the trigger on close. Paired with role="dialog"/aria-modal on the overlay.
  const transmissionDialogRef = useRef<HTMLDivElement>(null)
  const transmissionPrevFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!showTransmissionDialog) return
    transmissionPrevFocusRef.current = document.activeElement as HTMLElement | null
    const container = transmissionDialogRef.current
    const focusable = () =>
      container
        ? Array.from(
            container.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : []
    focusable()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setShowTransmissionDialog(false)
        return
      }
      if (e.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      transmissionPrevFocusRef.current?.focus?.()
    }
  }, [showTransmissionDialog])
  const [tireWidth, setTireWidth] = useState(235)
  const [tireAspectRatio, setTireAspectRatio] = useState(35)
  const [tireRimSize, setTireRimSize] = useState(19)
  const [tireSizeInput, setTireSizeInput] = useState("235/35R19")
  const [presetSearchQuery, setPresetSearchQuery] = useState("")
  const [presetSortOption, setPresetSortOption] = useState<"default" | "alphabetical">("default")

  useEffect(() => {
    if (!isPlaying || data.length === 0) return
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        // Play within the user-selected analysis window: stop at the range end and loop
        // back to the range start (not absolute 0), so narrowing the Time Range actually
        // scopes playback. timeRange is in the deps so the interval restarts on change.
        if (prev >= timeRange[1]) {
          setIsPlaying(false)
          return timeRange[0]
        }
        // If the cursor is before the window, jump to its start before advancing.
        return prev < timeRange[0] ? timeRange[0] : prev + 1
      })
    }, 100)
    return () => clearInterval(interval)
  }, [isPlaying, data.length, timeRange])

  // Re-clamp currentTime into the active timeRange whenever the user narrows the window.
  // Without this the scrubbed point can sit outside [timeRange[0], timeRange[1]], making
  // the PID Analysis "current value" (which looks up against the narrowed chart data)
  // show N/A while the Current Values panel still shows an out-of-window row.
  useEffect(() => {
    setCurrentTime((t) => Math.min(Math.max(t, timeRange[0]), timeRange[1]))
  }, [timeRange])

  // Keyboard shortcuts for playback/scrubbing. Space toggles play/pause; ArrowLeft/Right
  // step one sample (Shift = 10); Home/End jump to the range start/end. Ignored while a
  // text field is focused so typing in the search/config inputs isn't hijacked.
  useEffect(() => {
    if (data.length === 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      const [lo, hi] = timeRange
      const step = e.shiftKey ? 10 : 1
      switch (e.key) {
        case " ":
          e.preventDefault()
          setIsPlaying((p) => !p)
          break
        case "ArrowLeft":
          e.preventDefault()
          setIsPlaying(false)
          setCurrentTime((t) => Math.max(lo, t - step))
          break
        case "ArrowRight":
          e.preventDefault()
          setIsPlaying(false)
          setCurrentTime((t) => Math.min(hi, t + step))
          break
        case "Home":
          e.preventDefault()
          setIsPlaying(false)
          setCurrentTime(lo)
          break
        case "End":
          e.preventDefault()
          setIsPlaying(false)
          setCurrentTime(hi)
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [data.length, timeRange])

  // Precompute the set of "empty" metric keys (all zero/null/undefined/NaN) in a single
  // pass keyed only on [data, metrics]. Previously isEmptyPID did a full data.every() scan
  // per metric on EVERY call — and filteredMetrics (which lists searchQuery in its deps)
  // called it per metric on every keystroke, so filtering the PID list was O(metrics × n)
  // per keystroke. This makes the per-metric check an O(1) Set lookup.
  const emptyPidKeys = useMemo(() => {
    const empty = new Set<string>()
    for (const metric of metrics) {
      const key = metric.key as string
      const allEmpty = data.every((point) => {
        const value = (point as any)[key]
        return value === 0 || value === null || value === undefined || isNaN(value)
      })
      if (allEmpty) empty.add(key)
    }
    return empty
  }, [data, metrics])

  const isEmptyPID = useCallback(
    (metric: MetricConfig) => emptyPidKeys.has(metric.key as string),
    [emptyPidKeys],
  )

  const parseCSV = useCallback(
    async (file: File) => {
      setIsLoading(true)
      // Clear any "viewing a shared log" banner; the shared loader re-sets it after parse.
      setSharedNotice(null)
      try {
        const text = await file.text()
        const result = await parseInWorker(text, transmissionConfig)

        // Degenerate-file cases surfaced by the pure parser (see lib/parse-csv.ts).
        // Reset to a clean "no data" state and tell the user, mirroring the original
        // inline handling.
        if (result.status === "empty") {
          setMetrics([])
          setData([])
          setTimeRange([0, 0])
          setCurrentTime(0)
          setMissingPIDs({ missing: [], hasCriticalMissing: false })
          setRawCsv(null)
          showToast("The selected CSV file is empty or contains no data.")
          return
        }
        if (result.status === "headerOnly") {
          setMetrics([])
          setData([])
          setTimeRange([0, 0])
          setCurrentTime(0)
          setMissingPIDs({ missing: [], hasCriticalMissing: false })
          setRawCsv(null)
          showToast("The CSV file has a header row but no data rows.")
          return
        }
        if (result.status === "error") {
          // The worker caught a parse failure. Reset and surface the same message the
          // synchronous catch below uses.
          setMetrics([])
          setData([])
          setTimeRange([0, 0])
          setCurrentTime(0)
          setMissingPIDs({ missing: [], hasCriticalMissing: false })
          setRawCsv(null)
          showToast("Couldn't parse this CSV file. Check the format and try again.")
          return
        }

        // Success: apply the parsed result to state in the original order.
        setRawCsv(text)
        setSpeedUnit(result.speedUnit)
        setTripDurationUnit(result.tripDurationUnit)
        setMetrics(result.metrics)
        setMissingPIDs(result.missingPIDs)
        // Show warning dialog if crucial PIDs are missing
        if (result.missingPIDs.missing.length > 0) {
          setShowMissingPIDsDialog(true)
        }
        setData(result.data)
        setTimeRange([0, Math.max(0, result.data.length - 1)])
        setCurrentTime(0)
      } catch (error) {
        // Any unexpected parse failure (beyond the empty / header-only cases handled
        // above) previously vanished into the console, leaving the user with a
        // disappearing spinner and no feedback or recovery path. Reset to a clean
        // "no data" state and surface a message so they can re-upload.
        console.error("Error parsing CSV:", error)
        setMetrics([])
        setData([])
        setTimeRange([0, 0])
        setCurrentTime(0)
        setMissingPIDs({ missing: [], hasCriticalMissing: false })
        setRawCsv(null)
        showToast("Couldn't parse this CSV file. Check the format and try again.")
      } finally {
        setIsLoading(false)
      }
    },
    [transmissionConfig, showToast],
  )

  const loadSampleData = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/sample-data.csv")
      const csvText = await response.text()
      const blob = new Blob([csvText], { type: "text/csv" })
      const file = new File([blob], "sample-data.csv", { type: "text/csv" })
      setSelectedFile(file)
      setImportedFileNames(["sample-data.csv"])
      await parseCSV(file)
    } catch (error) {
      console.error("Error loading sample data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [parseCSV])

  // Export the processed data for the current Time Range window as a CSV download.
  const handleExportCsv = useCallback(() => {
    if (data.length === 0) return
    const csv = buildWindowCsv(data, metrics, timeRange[0], timeRange[1])
    const base = (importedFileNames[0] || "obd-log").replace(/\.csv$/i, "")
    downloadCsv(csv, `${base}-export.csv`)
    showToast("Exported the current window as CSV.")
  }, [data, metrics, timeRange, importedFileNames, showToast])

  // Create an expiring share link for the currently loaded log. POSTs the raw CSV to the
  // server route, which stores it and returns a short id; the data leaves the browser only
  // on this explicit action.
  const handleShare = useCallback(async () => {
    if (!rawCsv) {
      showToast("Load a log before sharing.")
      return
    }
    setShareCopied(false)
    setIsSharing(true)
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: rawCsv }),
      })
      if (!res.ok) {
        showToast(
          res.status === 413
            ? "This log is too large to share."
            : res.status === 501
              ? "Sharing isn't configured on this instance."
              : "Couldn't create a share link. Please try again.",
        )
        return
      }
      const json = (await res.json()) as { id: string; expiresAt?: string }
      const url = `${window.location.origin}/?share=${json.id}`
      setShareUrl(url)
      setShareExpiresAt(json.expiresAt ?? null)
      setShareDialogOpen(true)
      // Best-effort auto-copy; the dialog also has a manual Copy button as a fallback.
      try {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
      } catch {
        /* clipboard unavailable (insecure context / denied) — manual copy still works */
      }
    } catch {
      showToast("Couldn't create a share link. Please try again.")
    } finally {
      setIsSharing(false)
    }
  }, [rawCsv, showToast])

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      showToast("Couldn't copy — select the link and copy it manually.")
    }
  }, [shareUrl, showToast])

  // On first load, if the URL carries ?share=<id>, DON'T auto-fetch: a link shouldn't be
  // able to silently pull remote content into the analyzer (spoofing) or overwrite whatever
  // the user already has open. Record the id and ask for explicit confirmation first (#25).
  useEffect(() => {
    if (!SHARING_ENABLED || sharedLoadedRef.current) return
    const shareId = new URLSearchParams(window.location.search).get("share")
    if (!shareId) return
    sharedLoadedRef.current = true
    setPendingShareId(shareId)
  }, [])

  // Actually fetch + render a shared log, only after the user confirms the prompt above.
  const loadSharedLog = useCallback(
    async (shareId: string) => {
      setPendingShareId(null)
      setIsLoading(true)
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(shareId)}`)
        if (!res.ok) {
          showToast(
            res.status === 404 || res.status === 410
              ? "This shared log has expired or no longer exists."
              : "Couldn't load the shared log.",
          )
          return
        }
        const json = (await res.json()) as { csv: string; expiresAt?: string }
        const file = new File([json.csv], "shared-log.csv", { type: "text/csv" })
        setSelectedFile(file)
        setImportedFileNames(["shared-log.csv"])
        await parseCSV(file)
        // parseCSV clears any prior banner on entry, so set the notice afterwards.
        setSharedNotice({ expiresAt: json.expiresAt ?? null })
      } catch {
        showToast("Couldn't load the shared log.")
      } finally {
        setIsLoading(false)
      }
    },
    [parseCSV, showToast],
  )

  // Dismiss the share prompt and drop the ?share= param so a refresh doesn't re-ask.
  const dismissSharedPrompt = useCallback(() => {
    setPendingShareId(null)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("share")
      window.history.replaceState({}, "", url.toString())
    } catch {
      /* history API unavailable — the prompt is already dismissed in state */
    }
  }, [])

  // Escape cancels the share-confirmation prompt (parity with the other modals).
  useEffect(() => {
    if (!pendingShareId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissSharedPrompt()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pendingShareId, dismissSharedPrompt])

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const csvFiles = Array.from(event.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".csv"),
      )
      if (csvFiles.length === 0) return
      if (csvFiles.length === 1) {
        setSelectedFile(csvFiles[0])
        setImportedFileNames([csvFiles[0].name])
        parseCSV(csvFiles[0])
      } else {
        const ordered = determineFileOrder(csvFiles)
        setImportedFileNames(ordered.map((f) => f.name))
        try {
          // mergeCSVFiles throws if the files' headers don't align; surface that to the user.
          const merged = await mergeCSVFiles(ordered)
          setSelectedFile(merged)
          parseCSV(merged)
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Failed to merge CSV files")
        }
      }
    },
    [parseCSV, showToast],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const csvFiles = Array.from(event.target.files || []).filter((f) =>
        f.name.toLowerCase().endsWith(".csv"),
      )
      if (csvFiles.length === 0) return
      if (csvFiles.length === 1) {
        setSelectedFile(csvFiles[0])
        setImportedFileNames([csvFiles[0].name])
        parseCSV(csvFiles[0])
      } else {
        const ordered = determineFileOrder(csvFiles)
        setImportedFileNames(ordered.map((f) => f.name))
        try {
          // mergeCSVFiles throws if the files' headers don't align; surface that to the user.
          const merged = await mergeCSVFiles(ordered)
          setSelectedFile(merged)
          parseCSV(merged)
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Failed to merge CSV files")
        }
      }
    },
    [parseCSV, showToast],
  )

  const toggleMetric = useCallback((index: number) => {
    setMetrics((prev) => prev.map((metric, i) => (i === index ? { ...metric, enabled: !metric.enabled } : metric)))
  }, [])

  const filteredMetrics = useMemo(() => {
    let result = metrics

    // Filter by search query
    if (searchQuery) {
      result = result.filter(
        (metric) =>
          metric.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (metric.originalName && metric.originalName.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (metric.unit && metric.unit.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    }

    // Filter by empty PIDs
    if (!showEmptyPIDs) {
      result = result.filter((metric) => !isEmptyPID(metric))
    }

    // Sort
    if (sortOption === "alphabetical") {
      result = [...result].sort((a, b) => a.label.localeCompare(b.label))
    }

    return result
  }, [metrics, searchQuery, sortOption, showEmptyPIDs, isEmptyPID])

  const filteredData = useMemo(() => data.slice(timeRange[0], timeRange[1] + 1), [data, timeRange])

  // GPS fix count for the tab header, memoized on [data]. This predicate duplicates the
  // one inside GPSTrackMap; inlined in JSX it re-scanned the full dataset on every render
  // (every 100ms tick while the GPS tab plays).
  const gpsPointCount = useMemo(
    () =>
      data.filter(
        (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
      ).length,
    [data],
  )

  // Gear-distribution bars, memoized. Previously this was computed inline in JSX as
  // numberOfGears separate O(n) filteredData.filter() scans, re-running on every render
  // (i.e. every 100ms playback tick when the Performance tab is open). Now it's a single
  // O(n) pass keyed on [filteredData, numberOfGears].
  const gearDistribution = useMemo(() => {
    const gears = transmissionConfig.numberOfGears
    if (filteredData.length === 0 || gears <= 0) return []
    const counts = new Array<number>(gears + 1).fill(0)
    for (const d of filteredData) {
      const g = d.gear
      if (typeof g === "number" && g >= 1 && g <= gears) counts[g]++
    }
    return Array.from({ length: gears }, (_, i) => {
      const gear = i + 1
      const count = counts[gear]
      return {
        gear,
        count,
        percentage: count > 0 ? ((count / filteredData.length) * 100).toFixed(1) : "0.0",
      }
    })
  }, [filteredData, transmissionConfig.numberOfGears])

  // Metric key that holds altitude (parsed from an "Altitude (m)" column), if present.
  // Used for the elevation profile and to know whether to offer it at all.
  const altitudeKey = useMemo(() => {
    const m = metrics.find(
      (mc) =>
        mc.label === "Altitude" ||
        /altitude|elevation/i.test(mc.originalName || "") ||
        (mc.unit === "m" && /alt/i.test(mc.label)),
    )
    return m ? (m.key as string) : null
  }, [metrics])

  const finalChartData = useMemo(() => {
    // Cumulative distance (km) per sample, so charts can be plotted against distance
    // travelled instead of sample index. Prefer a real Trip Distance PID when the log has
    // one (handling its periodic reset-to-zero); otherwise integrate speed with a nominal
    // 1 s sample interval — the absolute scale may differ if the log isn't ~1 Hz, but the
    // shape (where each corner falls) is what makes distance alignment useful.
    const hasTripDistance = filteredData.some(
      (p) => typeof p.tripDistance === "number" && !isNaN(p.tripDistance as number),
    )
    let cumDist = 0
    let prevTrip: number | null = null
    const processed = filteredData.map((point) => {
      const chartPoint: DataPoint = { ...point }
      metrics.forEach((metricConfig) => {
        const key = metricConfig.key as string
        const value = (point as any)[key]
        chartPoint[key] = typeof value === "number" && !isNaN(value) ? value : 0
      })
      if (hasTripDistance) {
        const td =
          typeof point.tripDistance === "number" && !isNaN(point.tripDistance as number)
            ? (point.tripDistance as number)
            : prevTrip ?? 0
        if (prevTrip !== null) {
          const delta = td - prevTrip
          // Only count small forward increments as travel. Negative deltas are counter
          // resets, and large jumps (e.g. a leading 0.00 sentinel jumping to a trip
          // odometer already reading ~8 km) are baseline shifts, not distance covered in
          // one sample — both re-baseline without adding to the accumulated distance.
          if (delta >= 0 && delta < 2) cumDist += delta
        }
        prevTrip = td
      } else {
        const spd = typeof point.speed === "number" && !isNaN(point.speed) ? point.speed : 0
        cumDist += spd / 3600 // km travelled in a nominal 1 s step
      }
      chartPoint.dist = Math.round(cumDist * 1000) / 1000
      return chartPoint
    })
    if (processed.length > 500) {
      // Downsample with LTTB (peak-preserving) instead of uniform decimation. RPM is the
      // spikiest common channel, so it drives the shape; fall back to speed when RPM is
      // absent. Other series ride the same kept rows — no worse than uniform, and the
      // driver's transients are retained.
      return lttbDownsample(processed, 500, (p) => p.rpm || p.speed || 0)
    }
    return processed
  }, [filteredData, metrics])

  // Distance-axis is only meaningful once the vehicle has actually covered ground.
  const hasDistance = useMemo(
    () => finalChartData.length > 1 && (finalChartData[finalChartData.length - 1].dist ?? 0) > 0.05,
    [finalChartData],
  )
  const effectiveXMode = overviewXMode === "distance" && hasDistance ? "distance" : "time"

  // Elevation profile: altitude (m) vs cumulative distance (km). Only built when the log
  // actually carries a varying altitude channel, so the panel stays hidden otherwise.
  const elevationData = useMemo(() => {
    if (!altitudeKey) return []
    const pts = finalChartData
      .map((p) => ({ dist: p.dist ?? 0, time: p.time, altitude: Number((p as any)[altitudeKey]) }))
      .filter((p) => Number.isFinite(p.altitude))
    if (pts.length < 2) return []
    const min = Math.min(...pts.map((p) => p.altitude))
    const max = Math.max(...pts.map((p) => p.altitude))
    // Flat/constant altitude (e.g. a placeholder 0 column) isn't worth a chart.
    return max - min < 1 ? [] : pts
  }, [finalChartData, altitudeKey])

  // Acceleration runs (0–100 km/h, 0–60 mph, ¼-mile). Only computed when the log has real
  // per-sample clock timestamps — parseLogTimeSeconds returns null for index placeholders or
  // malformed time columns, in which case the whole panel is hidden rather than showing times
  // derived from a fake clock. Runs are found over the full log (idle standstills are needed
  // to mark launches, so filteredData / ignore-idle isn't used here). Speed is normalized to
  // km/h for the detector.
  const accelRuns = useMemo(() => {
    if (data.length < 3) return []
    const times = parseLogTimeSeconds(data.map((d) => d.timestamp))
    if (!times) return []
    const toKmh = speedUnit === "mph" ? 1.609344 : 1
    const speedsKmh = data.map((d) => (typeof d.speed === "number" && !isNaN(d.speed) ? d.speed * toKmh : 0))
    return detectAccelRuns(times, speedsKmh)
  }, [data, speedUnit])

  // Compute idle zones (consecutive ranges where speed === 0) for chart overlay
  const idleZones = useMemo(() => {
    if (!ignoreIdle || finalChartData.length === 0) return []
    const zones: { x1: number; x2: number }[] = []
    let zoneStart: number | null = null
    for (let i = 0; i < finalChartData.length; i++) {
      const isIdle = (finalChartData[i].speed || 0) === 0
      if (isIdle && zoneStart === null) {
        zoneStart = finalChartData[i].time
      } else if (!isIdle && zoneStart !== null) {
        // Extend the right edge to the FIRST non-idle sample (finalChartData[i]) rather
        // than the last idle one. A single retained idle sample previously produced
        // x1 === x2 (a zero-width ReferenceArea that renders as nothing); using the next
        // sample guarantees every interior idle run spans at least one band. x1/x2 remain
        // time values that exist in finalChartData, so the category-axis area still renders.
        zones.push({ x1: zoneStart, x2: finalChartData[i].time })
        zoneStart = null
      }
    }
    if (zoneStart !== null) {
      zones.push({ x1: zoneStart, x2: finalChartData[finalChartData.length - 1].time })
    }
    return zones
  }, [finalChartData, ignoreIdle])

  // Memoized so its reference is stable across playback ticks — see overviewChartElement (#28).
  const enabledMetrics = useMemo(() => metrics.filter((m) => m.enabled), [metrics])
  const currentDataPoint = data[currentTime] || null

  // The Overview chart depends only on the (memoized) data/config below — never on
  // currentTime — yet it re-rendered on every 100 ms playback tick because the parent
  // re-renders. Memoizing the element keeps its reference stable across ticks, so React
  // skips re-rendering the whole Recharts subtree unless the underlying data actually
  // changes (#28). Deps list every reactive value the chart reads.
  const overviewChartElement = useMemo(
    () => (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: effectiveXMode === "distance" ? 20 : 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
          {effectiveXMode === "distance" ? (
            <XAxis
              dataKey="dist"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke="#7e899c"
              fontSize={12}
              tickFormatter={(v) => Number(v).toFixed(1)}
              label={{ value: "Distance (km)", position: "insideBottom", offset: -8, fill: "#7e899c", fontSize: 11 }}
            />
          ) : (
            <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
          )}
          <YAxis stroke="#7e899c" fontSize={12} />
          <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} />
          {enabledMetrics.map((metric) => (
            <Line
              key={metric.key}
              type="monotone"
              dataKey={metric.key as string}
              stroke={metric.color}
              strokeWidth={2}
              dot={false}
              name={`${metric.label} (${metric.unit})`}
            />
          ))}
          {effectiveXMode === "time" &&
            idleZones.map((zone, i) => (
              <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
    ),
    [finalChartData, effectiveXMode, tooltipContentStyle, enabledMetrics, idleZones],
  )

  const tempSensors = useMemo(() => {
    const sensors = []
    if (data.some((d) => d.coolantTemp)) sensors.push({ key: "coolantTemp", label: "Coolant", color: "#8b5cf6" })
    if (data.some((d) => d.intakeTemp)) sensors.push({ key: "intakeTemp", label: "Intake Air", color: "#06b6d4" })
    if (data.some((d) => d.catTemp)) sensors.push({ key: "catTemp", label: "Catalyst", color: "#f59e0b" })
    if (data.some((d) => d.oilTemp)) sensors.push({ key: "oilTemp", label: "Oil", color: "#ef4444" })
    if (data.some((d) => d.transTemp)) sensors.push({ key: "transTemp", label: "Transmission", color: "#84cc16" })
    if (data.some((d) => d.exhaustTemp)) sensors.push({ key: "exhaustTemp", label: "Exhaust", color: "#ec4899" })
    return sensors
  }, [data])

  const stats = useMemo(() => {
    if (data.length === 0)
      return {
        maxRPM: 0,
        maxSpeed: 0,
        maxBoost: 0,
        avgCoolant: 0,
        avgIntakeTemp: 0,
        maxPower: 0,
        maxTorque: 0,
        avgSpeed: 0,
        avgRPM: 0,
      }

    // When ignoring idle, exclude data points where speed is 0 from statistics
    const statsData = ignoreIdle ? data.filter((d) => (d.speed || 0) > 0) : data

    // Filter out invalid values (0, null, undefined, NaN) for max calculations
    const validRPMs = statsData.map((d) => d.rpm || 0).filter((v) => v > 0)
    const validBoosts = statsData.map((d) => d.boost || 0).filter((v) => !isNaN(v))
    const validPowers = statsData.map((d) => d.enginePower || 0).filter((v) => v > 0)
    const validTorques = statsData.map((d) => d.engineTorque || 0).filter((v) => v > 0)
    // Use `?? NaN` (not `|| 0`) so genuine 0 °C and sub-zero readings are kept and
    // only truly-absent values are excluded — this distinguishes "missing" from "zero"
    // and stops the cold-climate average from being biased upward.
    const validCoolants = statsData.map((d) => d.coolantTemp ?? NaN).filter((v) => !isNaN(v))
    const validIntakes = statsData.map((d) => d.intakeTemp ?? NaN).filter((v) => !isNaN(v))
    const validSpeeds = statsData.map((d) => d.speed || d.gpsSpeed || 0).filter((v) => v > 0)

    // Average speed must respect the Ignore Idle toggle: include idle (speed=0) samples
    // when unchecked (statsData = full data) and exclude them when checked (statsData
    // already drops speed=0 rows). validSpeeds keeps its >0 filter for the max-speed path.
    const speedsForAvg = statsData.map((d) => d.speed || d.gpsSpeed || 0)

    // For max speed, try multiple sources in order of preference
    // First, try to find a dedicated "Max Speed" field
    const maxSpeedFromField = statsData.map((d) => d.maxSpeed || 0).filter((v) => v > 0)

    // Never under-report below the actual speed-trace peak: a stale/capped "Max Speed"
    // PID column could otherwise win over a higher real trace maximum. Take the larger
    // of the dedicated field and the speed trace.
    const fieldMax = maxSpeedFromField.length > 0 ? safeMax(maxSpeedFromField) : 0
    const traceMax = validSpeeds.length > 0 ? safeMax(validSpeeds) : 0
    const maxSpeed = Math.max(fieldMax, traceMax)

    return {
      maxRPM: validRPMs.length > 0 ? safeMax(validRPMs) : 0,
      maxSpeed: maxSpeed,
      maxBoost: validBoosts.length > 0 ? safeMax(validBoosts) : 0,
      avgCoolant: validCoolants.length > 0 ? validCoolants.reduce((sum, v) => sum + v, 0) / validCoolants.length : 0,
      avgIntakeTemp: validIntakes.length > 0 ? validIntakes.reduce((sum, v) => sum + v, 0) / validIntakes.length : 0,
      maxPower: validPowers.length > 0 ? safeMax(validPowers) : 0,
      maxTorque: validTorques.length > 0 ? safeMax(validTorques) : 0,
      avgSpeed: speedsForAvg.length > 0 ? speedsForAvg.reduce((sum, v) => sum + v, 0) / speedsForAvg.length : 0,
      avgRPM: validRPMs.length > 0 ? validRPMs.reduce((sum, v) => sum + v, 0) / validRPMs.length : 0,
    }
  }, [data, ignoreIdle])

  // Trip Distance/Fuel/Duration are cumulative counters that RESET to 0 at the
  // start of each logged trip, so when several files are merged the series resets
  // at every file boundary and the last row only reflects the final trip. Sum the
  // positive increments (each downward reset begins a new trip from its low point)
  // to recover the true total across all merged trips. Fuel economy is a rate, so
  // recompute it from the aggregate fuel and distance rather than summing.
  const tripTotals = useMemo(() => {
    const sumWithResets = (key: keyof DataPoint): number | null => {
      let total = 0
      let prev = 0
      let seen = false
      for (const point of data) {
        const v = point[key] as number | undefined
        if (typeof v !== "number" || isNaN(v)) continue
        seen = true
        if (v >= prev) total += v - prev
        prev = v
      }
      return seen ? total : null
    }
    const distance = sumWithResets("tripDistance")
    const fuel = sumWithResets("tripFuel")
    const rawDuration = sumWithResets("tripDuration")
    // Normalize the summed duration to minutes based on the column's detected unit, so the
    // "Xh Ymin" readout is correct for loggers that emit seconds as well as minutes.
    const durationUnit = tripDurationUnit.toLowerCase()
    const durationMinutes =
      rawDuration == null
        ? null
        : /^(s|sec|second)/.test(durationUnit)
          ? rawDuration / 60
          : /^(h|hr|hour)/.test(durationUnit)
            ? rawDuration * 60
            : rawDuration
    const fuelEconomy =
      fuel != null && distance != null && distance > 0 ? (fuel / distance) * 100 : null
    return { distance, fuel, duration: durationMinutes, fuelEconomy }
  }, [data, tripDurationUnit])

  const autoDetection = useMemo(() => {
    if (data.length > 100) {
      return detectGearRatios(data, speedUnit)
    }
    return null
  }, [data, speedUnit])

  // Dedupe inside the functional updater against the latest state (not a closed-over,
  // possibly stale selectedPIDs) and drop the [selectedPIDs] dep so the callback identity
  // is stable. Returning prev unchanged when already present avoids an extra render and
  // guarantees no duplicate even if called twice within one render batch. Mirrors removePID.
  const addPID = useCallback(
    (pidKey: string) => setSelectedPIDs((prev) => (prev.includes(pidKey) ? prev : [...prev, pidKey])),
    [],
  )

  const removePID = useCallback((pidKey: string) => {
    setSelectedPIDs((prev) => prev.filter((pid) => pid !== pidKey))
  }, [])

  // Filter and sort transmission presets
  const filteredTransmissionPresets = useMemo(() => {
    let result = transmissionPresets

    // Filter by search query
    if (presetSearchQuery) {
      result = result.filter((preset) => preset.name.toLowerCase().includes(presetSearchQuery.toLowerCase()))
    }

    // Sort
    if (presetSortOption === "alphabetical") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    }

    return result
  }, [transmissionPresets, presetSearchQuery, presetSortOption])

  // Static height for all tabs - no more dynamic calculations
  const STATIC_HEIGHT = 1000
  const metricsListHeight = Math.min(400, filteredMetrics.length * 35 + 100)
  const pidAnalysisHeight =
    selectedPIDs.length > 6 ? STATIC_HEIGHT + (Math.ceil(selectedPIDs.length / 2) - 3) * 250 : STATIC_HEIGHT

  const pidDisplayTimeKey = pidAnalysisHoveredTimeKey !== null ? pidAnalysisHoveredTimeKey : currentTime

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-3 pr-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-[0_0_18px_-4px] shadow-primary/50">
                <Gauge className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <h1 className="text-base font-semibold tracking-tight">OBD Data Analyzer</h1>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Telemetry Console
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" /> Load CSV
              </Button>
              <Button
                onClick={loadSampleData}
                variant="outline"
                size="sm"
              >
                <FileText className="w-4 h-4 mr-2" /> Load Sample
              </Button>
            </div>
            {selectedFile && (
              <div className="w-full text-xs md:w-auto">
                <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/80 bg-secondary/50 py-1 pl-2.5 pr-3 text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/70" />
                  <span className="max-w-[200px] truncate font-medium text-foreground/90">
                    {importedFileNames.length > 1
                      ? `${importedFileNames.length} files merged`
                      : selectedFile.name}
                  </span>
                  <span className="font-mono tabular-nums">{data.length} records</span>
                  <span className="font-mono uppercase text-primary">{speedUnit}</span>
                </span>
                {importedFileNames.length > 1 && (
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {importedFileNames.join(" → ")}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            <Button
              onClick={toggleTheme}
              variant="outline"
              size="sm"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Link href="/changelogs">
              <Button variant="outline" size="sm">
                <History className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Changelogs</span>
              </Button>
            </Link>
            <Button
              onClick={() => setShowTransmissionDialog(true)}
              variant="outline"
              size="sm"
              className={data.length === 0 ? "opacity-50 cursor-not-allowed" : ""}
              disabled={data.length === 0}
            >
              <Settings className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Transmission</span>
            </Button>
            <Button
              onClick={() => setIsPlaying(!isPlaying)}
              variant="outline"
              size="sm"
              className="data-[playing=true]:text-primary"
              data-playing={isPlaying}
              disabled={data.length === 0}
              aria-label={isPlaying ? "Pause playback" : "Play playback"}
              aria-pressed={isPlaying}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              onClick={() => setCurrentTime(0)}
              variant="outline"
              size="sm"
              disabled={data.length === 0}
              aria-label="Reset to start"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              disabled={data.length === 0}
              aria-label="Export current window as CSV"
              title="Export the current time-range window as CSV"
            >
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            {SHARING_ENABLED && (
              <Button
                onClick={handleShare}
                variant="outline"
                size="sm"
                disabled={data.length === 0 || isSharing}
              >
                {isSharing ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                ) : (
                  <Share2 className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">{isSharing ? "Sharing…" : "Share"}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] px-4 py-6 lg:px-6">

      {sharedNotice && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm text-foreground/80">
          <Share2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium text-foreground/90">You're viewing a shared log.</span>
          {sharedNotice.expiresAt && (
            <span className="text-muted-foreground">
              This link expires {new Date(sharedNotice.expiresAt).toLocaleString()}.
            </span>
          )}
        </div>
      )}

      {/* Share link dialog */}
      <AlertDialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Shareable link created
            </AlertDialogTitle>
            <AlertDialogDescription>
              Anyone with this link can view this log
              {shareExpiresAt ? ` until ${new Date(shareExpiresAt).toLocaleString()}` : ""}. The log is stored
              on this instance's backend (not embedded in the link); the link stops working when it expires.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={shareUrl ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={copyShareUrl} aria-label="Copy share link">
              {shareCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShareDialogOpen(false)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Missing PIDs Warning Dialog */}
      <AlertDialog open={showMissingPIDsDialog} onOpenChange={setShowMissingPIDsDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              Missing Crucial Data Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              Your datalog appears to be missing some important PIDs that are essential for the full functionality of
              this analyzer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-secondary/50 p-4">
              <h3 className="font-semibold text-white mb-3">Missing PIDs:</h3>
              <div className="space-y-3">
                {missingPIDs.missing.map((pid, index) => (
                  <div key={index} className="border-l-4 border-yellow-400 pl-4">
                    <div className="font-medium text-yellow-400">{pid.name}</div>
                    <div className="text-sm text-foreground/80 mt-1">{pid.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">Affects: {pid.tabs.join(", ")} tabs</div>
                    <div className="text-xs text-muted-foreground mt-1">Looking for: {pid.keys.join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>

            {missingPIDs.hasCriticalMissing && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Critical Data Missing
                </div>
                <p className="text-sm text-red-300">
                  Essential PIDs like Engine RPM or Vehicle Speed are missing. This will significantly limit the
                  analyzer's functionality.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-primary/25 bg-primary/[0.08] p-4">
              <h3 className="font-semibold text-primary mb-2">Recommendations:</h3>
              <ul className="text-sm text-foreground/80 space-y-1">
                <li>• Check your OBD scanner's PID logging settings</li>
                <li>• Ensure your vehicle supports these PIDs</li>
                <li>• Try enabling more PIDs in your logging software</li>
                <li>• Some features may not work properly without this data</li>
              </ul>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowMissingPIDsDialog(false)}
              className=""
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center gap-5 py-24 text-center"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Loading and parsing data...
          </div>
        </div>
      )}
      {data.length > 0 && (
        <>
          <Card className="p-5 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              <div>
                <label className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Current Time
                  </span>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {currentTime} / {data.length - 1}{" "}
                    <span className="text-primary">({((currentTime / Math.max(1, data.length - 1)) * 100).toFixed(1)}%)</span>
                  </span>
                </label>
                <Slider
                  value={[currentTime]}
                  onValueChange={([value]: number[]) => setCurrentTime(value)}
                  max={data.length - 1}
                  step={1}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Time Range
                  </span>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {timeRange[0]} - {timeRange[1]}{" "}
                    <span className="text-primary">
                      ({timeRange[1] - timeRange[0] + 1} points,{" "}
                      {(((timeRange[1] - timeRange[0] + 1) / data.length) * 100).toFixed(1)}%)
                    </span>
                  </span>
                </label>
                <Slider
                  value={timeRange}
                  onValueChange={setTimeRange}
                  max={data.length - 1}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/80">
              <Checkbox
                checked={ignoreIdle}
                onCheckedChange={(checked: boolean) => setIgnoreIdle(checked === true)}
                aria-label="Ignore idle — exclude speed = 0 from statistics and averages"
              />
              <span className="text-sm font-medium">Ignore Idle</span>
              <span className="text-xs text-muted-foreground">(Excludes speed = 0 from statistics and averages)</span>
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            {/* Mobile: wrap to multiple rows so every tab stays visible and tappable (no
                horizontally-scrolled, half-clipped tabs). Desktop: single flush row. */}
            <TabsList className="flex w-full flex-wrap gap-1 h-auto py-1 md:h-11 md:flex-nowrap md:py-1">
              <TabsTrigger value="overview" className="flex-1 min-w-[92px]">Overview</TabsTrigger>
              <TabsTrigger value="performance" className="flex-1 min-w-[92px]">Performance</TabsTrigger>
              <TabsTrigger value="engine" className="flex-1 min-w-[92px]">
                Engine
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex-1 min-w-[92px]">
                PID Analysis
              </TabsTrigger>
              <TabsTrigger value="gps" className="flex-1 min-w-[92px]">
                GPS Track
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:h-[1000px]">
                <div className="col-span-1 md:col-span-2">
                  <Card className="h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Available PIDs ({metrics.length})</h2>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search PIDs..." aria-label="Search PIDs"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8">
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Sort
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="">
                            <DropdownMenuItem
                              onClick={() => setSortOption("default")}
                              className={sortOption === "default" ? "bg-accent" : ""}
                            >
                              Default Order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortOption("alphabetical")}
                              className={sortOption === "alphabetical" ? "bg-accent" : ""}
                            >
                              Alphabetical
                            </DropdownMenuItem>
                            <div className="px-2 py-1.5">
                              <div className="flex items-center space-x-2">
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={(checked) => setShowEmptyPIDs(checked === true)} aria-label="Show empty PIDs (all-zero channels)" />
                                <span className="text-sm">Show Empty PIDs</span>
                              </div>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden px-4">
                      <div
                        className="space-y-3 overflow-y-auto pr-2"
                        style={{
                          height: `${metricsListHeight}px`,
                          scrollbarWidth: "thin",
                          scrollbarColor:
                            theme === "light" ? "#c2cbd9 #eef1f6" : "#2c3447 #11141d",
                        }}
                      >
                        {filteredMetrics.length > 0 ? (
                          filteredMetrics.map((metric, index) => {
                            const originalIndex = metrics.findIndex((m) => m.key === metric.key)
                            const isEmpty = isEmptyPID(metric)
                            return (
                              <div
                                key={metric.key}
                                className={`flex items-center space-x-2 ${isEmpty ? "opacity-50" : ""}`}
                                title={`${metric.originalName || metric.label}${isEmpty ? " (Empty PID)" : ""}`}
                              >
                                <Checkbox
                                  checked={metric.enabled}
                                  onCheckedChange={() => toggleMetric(originalIndex)}
                                  aria-label={`Show ${metric.label} on the chart`}
                                />
                                <div
                                  className="w-3 h-3 rounded flex-shrink-0"
                                  style={{ backgroundColor: metric.color }}
                                />
                                <span className="text-sm truncate">{metric.label}</span>
                                {metric.unit && (
                                  <span className="text-xs text-muted-foreground flex-shrink-0">({metric.unit})</span>
                                )}
                                {isEmpty && <span className="text-xs text-muted-foreground flex-shrink-0">∅</span>}
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-center text-muted-foreground py-4">No metrics found</div>
                        )}
                      </div>
                    </div>
                    {currentDataPoint && (
                      <div className="mt-auto p-4 pt-3 border-t border-border/80 flex-shrink-0">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current Values</h3>
                        <div className="space-y-1.5 text-sm [&>div>span:first-child]:text-muted-foreground [&>div>span+span]:font-mono [&>div>span+span]:tabular-nums">
                          <div className="flex justify-between">
                            <span>RPM:</span>
                            <span className="text-red-400">{formatValue(currentDataPoint.rpm, "RPM")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Speed:</span>
                            <span className="text-green-400">
                              {formatValue(currentDataPoint.speed, speedUnit)} {speedUnit}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Throttle:</span>
                            <span className="text-yellow-400">{formatValue(currentDataPoint.throttle, "%")}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Gear:</span>
                            <div className="flex items-center space-x-1">
                              <span className="text-blue-400">
                                {currentDataPoint
                                  ? calculateGear(currentDataPoint.speed, currentDataPoint.rpm, transmissionConfig, speedUnit)
                                  : "N/A"}
                              </span>
                              {currentDataPoint &&
                                (() => {
                                  const gear = calculateGear(
                                    currentDataPoint.speed,
                                    currentDataPoint.rpm,
                                    transmissionConfig,
                                    speedUnit,
                                  )
                                  const shiftIndicator = getShiftIndicator(
                                    currentDataPoint.rpm,
                                    gear,
                                    transmissionConfig,
                                  )
                                  if (shiftIndicator.shouldShift === "up") {
                                    return <span className="text-green-400 font-bold">↑</span>
                                  } else if (shiftIndicator.shouldShift === "down") {
                                    return <span className="text-orange-400 font-bold">↓</span>
                                  }
                                  return <span className="text-muted-foreground">•</span>
                                })()}
                            </div>
                          </div>
                          {currentDataPoint &&
                            (() => {
                              const gear = calculateGear(
                                currentDataPoint.speed,
                                currentDataPoint.rpm,
                                transmissionConfig,
                                speedUnit,
                              )
                              const shiftIndicator = getShiftIndicator(currentDataPoint.rpm, gear, transmissionConfig)
                              if (shiftIndicator.shouldShift !== "optimal" && shiftIndicator.shouldShift !== null) {
                                return <div className="text-xs text-muted-foreground mt-1">{shiftIndicator.reason}</div>
                              }
                              return null
                            })()}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
                <div className="col-span-1 md:col-span-7">
                  <Card className="p-5 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">General Overview</h2>
                      <div className="flex items-center gap-3">
                        {hasDistance && (
                          <div className="flex items-center rounded-md border border-border/80 p-0.5 text-[11px] font-medium" role="group" aria-label="Chart X axis">
                            <button
                              type="button"
                              onClick={() => setOverviewXMode("time")}
                              aria-pressed={effectiveXMode === "time"}
                              className={`rounded px-2 py-0.5 transition-colors ${effectiveXMode === "time" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              Time
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverviewXMode("distance")}
                              aria-pressed={effectiveXMode === "distance"}
                              className={`rounded px-2 py-0.5 transition-colors ${effectiveXMode === "distance" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              Distance
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => exportChartPng(overviewChartRef.current, "overview-chart.png", theme, showToast)}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Export chart as PNG"
                          title="Export chart as PNG"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <BarChart3 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    </div>
                    <div ref={overviewChartRef} className="flex-grow min-h-[320px]">
                    {overviewChartElement}
                    </div>
                  </Card>
                </div>
                <div className="col-span-1 md:col-span-3">
                  <Card className="p-5 h-full">
                    <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Session Statistics</h2>
                    <div className="space-y-2.5 text-sm [&>div>span:first-child]:text-muted-foreground [&>div>span+span]:font-mono [&>div>span+span]:text-[13px] [&>div>span+span]:tabular-nums">
                      <div className="flex justify-between">
                        <span>Max RPM:</span>
                        <span className="text-red-400 font-bold">{formatValue(stats.maxRPM, "RPM")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Speed:</span>
                        <span className="text-green-400 font-bold">
                          {formatValue(stats.maxSpeed, speedUnit)} {speedUnit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Boost Pressure:</span>
                        <span className="text-blue-400 font-bold">{formatValue(stats.maxBoost, "bar")} bar</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Calculated Power:</span>
                        <span className="text-pink-400 font-bold">{formatValue(stats.maxPower, "hp")} hp</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Calculated Torque:</span>
                        <span className="text-lime-400 font-bold">{formatValue(stats.maxTorque, "N•m")} N•m</span>
                      </div>
                      <div className="h-px bg-border/80 my-2"></div>
                      <div className="flex justify-between">
                        <span>Average Speed:</span>
                        <span className="text-green-400 font-bold">
                          {formatValue(stats.avgSpeed, speedUnit)} {speedUnit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average RPM:</span>
                        <span className="text-red-400 font-bold">{formatValue(stats.avgRPM, "RPM")}</span>
                      </div>
                      <div className="h-px bg-border/80 my-2"></div>
                      <div className="flex justify-between">
                        <span>Average Coolant Temp:</span>
                        <span className="text-purple-400 font-bold">{formatValue(stats.avgCoolant, "°C")}°C</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average Intake Temp:</span>
                        <span className="text-orange-400 font-bold">{formatValue(stats.avgIntakeTemp, "°C")}°C</span>
                      </div>
                      <div className="h-px bg-border/80 my-2"></div>
                      <div className="flex justify-between">
                        <span>Trip Duration:</span>
                        <span className="text-foreground/80">
                          {tripTotals.duration != null
                            ? tripTotals.duration >= 60
                              ? `${Math.floor(tripTotals.duration / 60)}h ${Math.floor(tripTotals.duration % 60)}min`
                              : `${Math.floor(tripTotals.duration)}min`
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Distance:</span>
                        <span className="text-foreground/80">
                          {tripTotals.distance != null ? `${formatValue(tripTotals.distance)} km` : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Fuel Used:</span>
                        <span className="text-foreground/80">
                          {tripTotals.fuel != null ? `${formatValue(tripTotals.fuel)} L` : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Fuel Economy:</span>
                        <span className="text-foreground/80">
                          {tripTotals.fuelEconomy != null ? `${formatValue(tripTotals.fuelEconomy)} L/100km` : "N/A"}
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              {accelRuns.length > 0 && (
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Acceleration</h2>
                    <Gauge className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {accelRuns.map((run) => (
                      <div key={run.label}>
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{run.label}</div>
                        <div className="font-mono text-2xl tabular-nums text-primary">{run.seconds.toFixed(2)}s</div>
                        {run.detail && <div className="text-xs text-muted-foreground">{run.detail}</div>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Best runs found in this log, timed from its per-sample timestamps.
                  </p>
                </Card>
              )}
              <ErrorBoundary>
              <PerformanceCharts finalChartData={finalChartData} gearDistribution={gearDistribution} idleZones={idleZones} speedUnit={speedUnit} tooltipContentStyle={tooltipContentStyle} transmissionConfig={transmissionConfig} />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="engine" className="space-y-0">
              <ErrorBoundary>
              <EngineCharts finalChartData={finalChartData} idleZones={idleZones} tempSensors={tempSensors} tooltipContentStyle={tooltipContentStyle} selectedTempSensors={selectedTempSensors} setSelectedTempSensors={setSelectedTempSensors} />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="analysis" className="space-y-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 max-md:!h-auto" style={{ height: `${pidAnalysisHeight}px` }}>
                <div className="col-span-1 md:col-span-2">
                  <Card className="h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Available PIDs ({metrics.length})</h2>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search PIDs..." aria-label="Search PIDs"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8"
                          />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8">
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Sort
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="">
                            <DropdownMenuItem
                              onClick={() => setSortOption("default")}
                              className={sortOption === "default" ? "bg-accent" : ""}
                            >
                              Default Order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortOption("alphabetical")}
                              className={sortOption === "alphabetical" ? "bg-accent" : ""}
                            >
                              Alphabetical
                            </DropdownMenuItem>
                            <div className="px-2 py-1.5">
                              <div className="flex items-center space-x-2">
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={(checked) => setShowEmptyPIDs(checked === true)} aria-label="Show empty PIDs (all-zero channels)" />
                                <span className="text-sm">Show Empty PIDs</span>
                              </div>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden px-4">
                      <div
                        className="space-y-3 overflow-y-auto pr-2"
                        style={{
                          height: `${metricsListHeight}px`,
                          scrollbarWidth: "thin",
                          scrollbarColor:
                            theme === "light" ? "#c2cbd9 #eef1f6" : "#2c3447 #11141d",
                        }}
                      >
                        {filteredMetrics.length > 0 ? (
                          filteredMetrics.map((metric) => {
                            const isEmpty = isEmptyPID(metric)
                            return (
                              <div
                                key={metric.key}
                                className={`flex items-center space-x-2 ${isEmpty ? "opacity-50" : ""}`}
                                title={`${metric.originalName || metric.label}${isEmpty ? " (Empty PID)" : ""}`}
                              >
                                <div
                                  className="w-3 h-3 rounded flex-shrink-0"
                                  style={{ backgroundColor: metric.color }}
                                />
                                <span className="text-sm truncate flex-1">{metric.label}</span>
                                {metric.unit && (
                                  <span className="text-xs text-muted-foreground flex-shrink-0">({metric.unit})</span>
                                )}
                                {isEmpty && <span className="text-xs text-muted-foreground flex-shrink-0">∅</span>}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => addPID(metric.key as string)}
                                  disabled={selectedPIDs.includes(metric.key as string)}
                                  className="h-8 w-8 p-0"
                                  aria-label={`Add ${metric.label} to analysis`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-center text-muted-foreground py-4">No PIDs found</div>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto p-4 pt-3 border-t border-border/80 flex-shrink-0">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selected PIDs ({selectedPIDs.length})</h3>
                      {selectedPIDs.length > 0 ? (
                        <div className="space-y-2 text-sm max-h-32 overflow-y-auto">
                          {selectedPIDs.map((pidKey) => {
                            const metric = metrics.find((m) => m.key === pidKey)
                            if (!metric) return null
                            return (
                              <div key={pidKey} className="flex items-center justify-between rounded-md bg-secondary/60 p-1.5">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: metric.color }} />
                                  <span className="font-medium">{metric.label}</span>
                                  {metric.unit && <span className="text-xs text-muted-foreground">({metric.unit})</span>}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removePID(pidKey)}
                                  className="h-6 w-6 p-0"
                                  aria-label={`Remove ${metric.label} from analysis`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No PIDs selected</div>
                      )}
                      {selectedPIDs.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPIDs([])}
                          className="w-full mt-3 h-7 text-xs"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
                <div className="col-span-1 md:col-span-10">
                  <Card className="h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">PID Analysis Charts</h2>
                    </div>
                    <div className="flex-1 p-4 pt-0">
                      {selectedPIDs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Select PIDs from the left panel to start analysis</p>
                            <p className="text-sm">Click the + button to add PIDs to your analysis</p>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={selectedPIDs.length}
                          className="grid gap-4 h-full"
                          style={{
                            gridTemplateColumns: selectedPIDs.length === 1 ? "1fr" : "repeat(2, 1fr)",
                            gridTemplateRows: `repeat(${Math.ceil(selectedPIDs.length / 2)}, 1fr)`,
                          }}
                        >
                          {selectedPIDs.map((pidKey) => {
                            const metric = metrics.find((m) => m.key === pidKey)
                            if (!metric) return null
                            // Look up against the full (non-downsampled) data, not finalChartData.
                            // finalChartData is downsampled when length > 500, so an exact time match
                            // fails for ~most currentTime values on large logs -> spurious "N/A". Since
                            // time === array index in data, data[key] is an O(1) hit; the find() is a
                            // safe fallback (and pidDisplayTimeKey from hover is always a real time in data).
                            const currentPidValueDataPoint =
                              data[pidDisplayTimeKey]?.time === pidDisplayTimeKey
                                ? data[pidDisplayTimeKey]
                                : data.find((p) => p.time === pidDisplayTimeKey) || null
                            const currentPidValue = currentPidValueDataPoint
                              ? currentPidValueDataPoint[metric.key as string]
                              : null

                            return (
                              <div key={pidKey} className="rounded-lg border border-border/70 bg-secondary/40 p-3 flex flex-col">
                                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                                  <h3 className="font-medium text-sm">{metric.label}</h3>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removePID(pidKey)}
                                    className="h-6 w-6 p-0"
                                    aria-label={`Remove ${metric.label} chart`}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex-grow min-h-[280px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                      data={finalChartData}
                                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                                      syncId="pidAnalysisSync"
                                      onMouseMove={(chartState: any) => {
                                        if (chartState && chartState.activeLabel) {
                                          setPidAnalysisHoveredTimeKey(Number(chartState.activeLabel))
                                        }
                                      }}
                                      onMouseLeave={() => {
                                        setPidAnalysisHoveredTimeKey(null)
                                      }}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" />
                                      <XAxis dataKey="time" stroke="#7e899c" fontSize={10} />
                                      <YAxis stroke="#7e899c" fontSize={10} domain={["auto", "auto"]} />
                                      <Tooltip
                                        contentStyle={{
                                          backgroundColor: "#11141d",
                                          border: "1px solid #273043",
                                          borderRadius: "10px",
                                          fontSize: "12px",
                                        }}
                                        formatter={tooltipFormatter}
                                      />
                                      <Line
                                        dataKey={metric.key as string}
                                        stroke={metric.color}
                                        strokeWidth={2}
                                        dot={false}
                                        name={`${metric.label} (${metric.unit})`}
                                      />
                                      {idleZones.map((zone, i) => (
                                        <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                                      ))}
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="text-center mt-2 flex-shrink-0">
                                  <span className="text-lg font-bold" style={{ color: metric.color }}>
                                    {typeof currentPidValue === "number"
                                      ? formatValue(currentPidValue, metric.unit)
                                      : "N/A"}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-1">{metric.unit}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="gps" className="space-y-4">
              <ErrorBoundary>
              <div className="h-[520px] md:h-[1000px]">
                <Card className="p-5 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">GPS Track Visualization</h2>
                    <div className="flex items-center gap-2">
                      <Map className="w-4 h-4" />
                      <span className="text-sm text-muted-foreground">
                        {/* Keep this predicate identical to gpsData (in GPSTrackMap) so the
                            count matches exactly what is drawn: count any finite fix except the
                            (0,0) no-fix sentinel, including valid equator/prime-meridian points. */}
                        {gpsPointCount}{" "}
                        GPS points
                      </span>
                    </div>
                  </div>
                  <div className="h-[calc(100%-3rem)]">
                    <GPSTrackMap data={data} currentTime={currentTime} onNotify={showToast} />
                  </div>
                </Card>
              </div>
              {elevationData.length > 1 && (
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Elevation Profile</h2>
                    <span className="text-sm text-muted-foreground">altitude vs distance</span>
                  </div>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={elevationData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                          <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis
                          dataKey="dist"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          stroke="#7e899c"
                          fontSize={12}
                          tickFormatter={(v) => Number(v).toFixed(1)}
                          label={{ value: "Distance (km)", position: "insideBottom", offset: -8, fill: "#7e899c", fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#7e899c"
                          fontSize={12}
                          domain={["dataMin - 5", "dataMax + 5"]}
                          tickFormatter={(v) => Math.round(Number(v)).toString()}
                          label={{ value: "Altitude (m)", angle: -90, position: "insideLeft", fill: "#7e899c", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={(value) => [`${Math.round(Number(value))} m`, "Altitude"]}
                          labelFormatter={(v) => `${Number(v).toFixed(2)} km`}
                        />
                        <Area type="monotone" dataKey="altitude" stroke="#22c55e" strokeWidth={2} fill="url(#elevationFill)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </>
      )}
      {data.length === 0 && !isLoading && (
        <div className="relative mx-auto mt-6 w-full max-w-3xl md:mt-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 left-1/2 h-72 w-[34rem] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative mb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              100% client-side · nothing leaves your browser
            </span>
            <h2 className="mt-6 text-balance text-4xl font-bold tracking-tight md:text-5xl">
              Decode your <span className="text-primary">drive</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground">
              Drop an OBD-II CSV log to explore RPM, speed, boost, gearbox usage and the GPS track — charted instantly,
              right here on your machine.
            </p>
          </div>
          <Card
            className={`relative border-dashed p-10 text-center transition-all duration-200 ${
              isDragOver
                ? "border-primary/70 bg-primary/[0.06] shadow-[0_0_50px_-12px] shadow-primary/40"
                : "hover:border-primary/40"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div
              className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors duration-200 ${
                isDragOver
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-secondary/60 text-muted-foreground"
              }`}
            >
              <Upload className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold mb-2">
              {isDragOver ? "Drop CSV file(s) here" : "Drag and drop CSV file(s) here"}
            </h2>
            <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground">
              Select one or multiple CSV files — multiple files will be merged automatically in order
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => fileInputRef.current?.click()} className="">
                <Upload className="w-4 h-4 mr-2" />
                Choose CSV File(s)
              </Button>
              <Button
                onClick={loadSampleData}
                variant="outline"
                className=""
              >
                <FileText className="w-4 h-4 mr-2" />
                Load Sample Data
              </Button>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">
              No log handy? <span className="font-medium text-muted-foreground">Load Sample Data</span> opens a bundled
              demo drive so you can explore every tab.
            </p>
          </Card>
        </div>
      )}
      {pendingShareId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissSharedPrompt()
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <Card className="w-full max-w-md p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start gap-3">
              <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 id="share-confirm-title" className="text-lg font-semibold tracking-tight">
                  Load shared log?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This link is asking to open a shared log in the analyzer. It was created by
                  whoever sent you the link — only load it if you trust the source. Loading it
                  will replace anything you currently have open.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={dismissSharedPrompt}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => loadSharedLog(pendingShareId)} autoFocus>
                Load shared log
              </Button>
            </div>
          </Card>
        </div>
      )}
      {showTransmissionDialog && (
        <div
          ref={transmissionDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="transmission-dialog-title"
          onClick={(e) => {
            // Click on the backdrop (outside the Card) closes the dialog.
            if (e.target === e.currentTarget) setShowTransmissionDialog(false)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/60">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 id="transmission-dialog-title" className="text-lg font-semibold tracking-tight">Transmission Configuration</h2>
                <Button onClick={() => setShowTransmissionDialog(false)} variant="ghost" size="sm" aria-label="Close transmission configuration">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Tabs defaultValue="manual" className="space-y-4">
                <TabsList className="flex w-full overflow-x-auto">
                  <TabsTrigger value="manual" className="flex-1 min-w-[80px]">Manual</TabsTrigger>
                  <TabsTrigger value="presets" className="flex-1 min-w-[80px]">Presets</TabsTrigger>
                  <TabsTrigger value="auto" className="flex-1 min-w-[80px]">
                    Auto Detection
                  </TabsTrigger>
                  <TabsTrigger value="import-export" className="flex-1 min-w-[80px]">
                    Import/Export
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Final Drive Ratio</label>
                      <Input
                        aria-label="Final Drive Ratio"
                        type="number"
                        step="0.01"
                        value={transmissionConfig.finalDrive}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            finalDrive: Number.parseFloat(e.target.value) || 4.35,
                          }))
                        }
                        className=""
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Tyre Diameter (mm)</label>
                      <Input
                        aria-label="Tyre Diameter in millimetres"
                        type="number"
                        value={transmissionConfig.tyreDiameterMm}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            tyreDiameterMm: Number.parseInt(e.target.value) || 647,
                          }))
                        }
                        className=""
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Shift RPM</label>
                      <Input
                        aria-label="Shift RPM"
                        type="number"
                        value={transmissionConfig.shiftRpm}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            shiftRpm: Number.parseInt(e.target.value) || 6900,
                          }))
                        }
                        className=""
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Number of Gears</label>
                      <Input
                        aria-label="Number of Gears"
                        type="number"
                        min="3"
                        max="10"
                        value={transmissionConfig.numberOfGears}
                        onChange={(e) => {
                          // Clamp to [3,10] for all input paths. The HTML min/max only
                          // constrain the spinner buttons; a directly typed/pasted value
                          // (e.g. "1" or "50") would otherwise corrupt the gearRatios config.
                          const newGears = Math.min(10, Math.max(3, Number.parseInt(e.target.value) || 6))
                          setTransmissionConfig((prev) => {
                            const newRatios = { ...prev.gearRatios }
                            for (let i = 1; i <= newGears; i++) {
                              if (!newRatios[i]) {
                                newRatios[i] = 1.0
                              }
                            }
                            Object.keys(newRatios).forEach((gear) => {
                              if (Number.parseInt(gear) > newGears) {
                                delete newRatios[Number.parseInt(gear)]
                              }
                            })
                            return {
                              ...prev,
                              numberOfGears: newGears,
                              gearRatios: newRatios,
                            }
                          })
                        }}
                        className=""
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-3">Gear Ratios</label>
                    <div className="grid grid-cols-4 gap-3">
                      {Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1).map((gear) => (
                        <div key={gear}>
                          <label className="block text-xs text-muted-foreground mb-1">Gear {gear}</label>
                          <Input
                            aria-label={`Gear ${gear} ratio`}
                            type="number"
                            step="0.001"
                            value={transmissionConfig.gearRatios[gear] || 1.0}
                            onChange={(e) =>
                              setTransmissionConfig((prev) => ({
                                ...prev,
                                gearRatios: {
                                  ...prev.gearRatios,
                                  [gear]: Number.parseFloat(e.target.value) || 1.0,
                                },
                              }))
                            }
                            className=" text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-3">Tire Size Calculator</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Tire Size (e.g., 235/35R19)</label>
                        <Input
                          aria-label="Tire size, e.g. 235/35R19"
                          type="text"
                          value={tireSizeInput}
                          onChange={(e) => {
                            setTireSizeInput(e.target.value)
                            const parsed = parseTireSize(e.target.value)
                            if (parsed) {
                              setTireWidth(parsed.width)
                              setTireAspectRatio(parsed.aspectRatio)
                              setTireRimSize(parsed.rimSize)
                              const diameter = calculateTireDiameter(parsed.width, parsed.aspectRatio, parsed.rimSize)
                              setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                            }
                          }}
                          placeholder="235/35R19"
                          className=" text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Calculated Diameter</label>
                        <div className="rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm font-mono">
                          {calculateTireDiameter(tireWidth, tireAspectRatio, tireRimSize)} mm
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Width (mm)</label>
                        <Input
                          aria-label="Tire width in millimetres"
                          type="number"
                          value={tireWidth}
                          onChange={(e) => {
                            const width = Number.parseInt(e.target.value) || 235
                            setTireWidth(width)
                            setTireSizeInput(`${width}/${tireAspectRatio}R${tireRimSize}`)
                            const diameter = calculateTireDiameter(width, tireAspectRatio, tireRimSize)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className=" text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Aspect Ratio (%)</label>
                        <Input
                          aria-label="Tire aspect ratio in percent"
                          type="number"
                          value={tireAspectRatio}
                          onChange={(e) => {
                            const aspect = Number.parseInt(e.target.value) || 35
                            setTireAspectRatio(aspect)
                            setTireSizeInput(`${tireWidth}/${aspect}R${tireRimSize}`)
                            // Use the freshly parsed `aspect`, not the stale `tireAspectRatio`
                            // state (still the pre-change value during this render), so the
                            // stored diameter reflects the new aspect ratio immediately.
                            const diameter = calculateTireDiameter(tireWidth, aspect, tireRimSize)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className=" text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Rim Size (inches)</label>
                        <Input
                          aria-label="Rim size in inches"
                          type="number"
                          value={tireRimSize}
                          onChange={(e) => {
                            const rim = Number.parseInt(e.target.value) || 19
                            setTireRimSize(rim)
                            setTireSizeInput(`${tireWidth}/${tireAspectRatio}R${rim}`)
                            const diameter = calculateTireDiameter(tireWidth, tireAspectRatio, rim)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className=" text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="presets" className="space-y-4">
                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search presets..." aria-label="Search transmission presets"
                        value={presetSearchQuery}
                        onChange={(e) => setPresetSearchQuery(e.target.value)}
                        className="pl-8  placeholder:text-muted-foreground"
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-10">
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Sort
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="">
                        <DropdownMenuItem
                          onClick={() => setPresetSortOption("default")}
                          className={presetSortOption === "default" ? "bg-accent" : ""}
                        >
                          Default Order
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setPresetSortOption("alphabetical")}
                          className={presetSortOption === "alphabetical" ? "bg-accent" : ""}
                        >
                          Alphabetical
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid gap-4">
                    {filteredTransmissionPresets.map((preset, index) => (
                      <Card key={index} className="border-border/70 bg-secondary/40 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="font-semibold text-white">{preset.name}</h2>
                          <Button
                            size="sm"
                            onClick={() => {
                              setTransmissionConfig(preset.config)
                              showToast(`Applied "${preset.name}" configuration`)
                            }}
                            className=""
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-foreground/80">
                          <div>Gears: {preset.config.numberOfGears}</div>
                          <div>Final Drive: {preset.config.finalDrive}</div>
                          <div>Shift RPM: {preset.config.shiftRpm}</div>
                          <div>Tire: {preset.config.tyreDiameterMm}mm</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Ratios:{" "}
                          {Object.values(preset.config.gearRatios)
                            .map((r) => r.toFixed(3))
                            .join(", ")}
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="auto" className="space-y-4">
                  <div className="text-center">
                    <Button
                      onClick={() => {
                        const results = detectGearRatios(data, speedUnit)
                        setAutoDetectionResults(results)
                        setShowAutoDetection(true)
                      }}
                      disabled={data.length < 100}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Analyze Current Data
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      {data.length < 100
                        ? `Need at least 100 data points (currently ${data.length})`
                        : `Analyze ${data.length} data points to detect gear ratios`}
                    </p>
                  </div>

                  {autoDetection && (
                    <Card className="border-border/70 bg-secondary/40 p-4">
                      <h2 className="font-semibold text-white mb-3">Auto-Detection Results</h2>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Detected Gears:</span>
                          <span className="text-white ml-2">{autoDetection.detectedGears}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Confidence:</span>
                          <span className="text-white ml-2">{autoDetection.confidence.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h3 className="text-sm font-medium text-white mb-2">Detected Gear Ratios:</h3>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {Object.entries(autoDetection.gearRatios).map(([gear, ratio]) => (
                            <div key={gear} className="rounded-md bg-secondary/50 p-2">
                              <span className="text-muted-foreground">Gear {gear}:</span>
                              <span className="text-white ml-1">{(ratio as number).toFixed(3)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={() => {
                          // numberOfGears must be the highest detected gear number, not the
                          // count of detected gears. Using the count would clamp/hide real
                          // high gears (e.g. detecting {3,4,5} would set numberOfGears=3).
                          // Derive it from the gearRatios keys, falling back to 6.
                          const gearKeys = Object.keys(autoDetection.gearRatios).map(Number)
                          const maxGear = gearKeys.length > 0 ? Math.max(...gearKeys) : 6
                          setTransmissionConfig({
                            gearRatios: autoDetection.gearRatios,
                            finalDrive: autoDetection.estimatedFinalDrive,
                            tyreDiameterMm: autoDetection.estimatedTireDiameter,
                            shiftRpm: 7000,
                            numberOfGears: maxGear,
                          })
                          showToast("Applied auto-detected transmission settings")
                        }}
                        className="mt-4 "
                        size="sm"
                      >
                        Apply Auto-Detected Settings
                      </Button>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="import-export" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-border/70 bg-secondary/40 p-4">
                      <h2 className="font-semibold text-white mb-3">Export Configuration</h2>
                      <p className="text-sm text-muted-foreground mb-4">
                        Save your current transmission settings to a JSON file.
                      </p>
                      <Button
                        onClick={() => exportTransmissionConfig(transmissionConfig)}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        Export Settings
                      </Button>
                    </Card>

                    <Card className="border-border/70 bg-secondary/40 p-4">
                      <h2 className="font-semibold text-white mb-3">Import Configuration</h2>
                      <p className="text-sm text-muted-foreground mb-4">Load transmission settings from a JSON file.</p>
                      <input
                        ref={transmissionFileInputRef}
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            importTransmissionConfig(
                              file,
                              (config) => {
                                setTransmissionConfig(config)
                                showToast("Transmission configuration imported successfully")
                              },
                              showToast,
                            )
                          }
                        }}
                        className="hidden"
                      />
                      <Button
                        onClick={() => transmissionFileInputRef.current?.click()}
                        className="w-full "
                      >
                        Import Settings
                      </Button>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between pt-6 border-t border-border/80">
                <Button
                  onClick={() => {
                    setTransmissionConfig({
                      gearRatios: {
                        1: 3.538,
                        2: 1.92,
                        3: 1.323,
                        4: 1.026,
                        5: 0.822,
                        6: 0.681,
                      },
                      finalDrive: 4.35,
                      tyreDiameterMm: 647,
                      shiftRpm: 6900,
                      numberOfGears: 6,
                    })
                    showToast("Reset to default configuration")
                  }}
                  variant="outline"
                  className=""
                >
                  Reset to Default
                </Button>
                <Button
                  onClick={() => {
                    setShowTransmissionDialog(false)
                    if (data.length > 0) {
                      // Recompute gear, but only clone the rows whose gear actually changes and
                      // skip the state update entirely when nothing did — instead of spreading
                      // every column of every row on each Apply (#34).
                      let changed = false
                      const updatedData = data.map((point) => {
                        const newGear =
                          point.speed && point.rpm
                            ? calculateGear(point.speed, point.rpm, transmissionConfig, speedUnit)
                            : point.gear
                        if (newGear === point.gear) return point
                        changed = true
                        return { ...point, gear: newGear }
                      })
                      if (changed) setData(updatedData)
                    }
                    showToast("Transmission configuration applied")
                  }}
                  className=""
                >
                  Apply Configuration
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-xl shadow-black/40 animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/70" />
          {toastMessage}
        </div>
      )}
      </main>
    </div>
  )
}
