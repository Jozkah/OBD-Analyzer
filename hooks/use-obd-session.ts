"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DataPoint, MetricConfig, TransmissionConfig } from "@/types/obd"
import { parseLogTimeSeconds, detectAccelRuns } from "@/lib/accel-runs"
import { safeMax, safeMin } from "@/lib/stats"
import { lttbDownsample } from "@/lib/downsample"
import { buildWindowCsv, downloadCsv, determineFileOrder } from "@/lib/csv"
import { calculateGear, detectGearRatios } from "@/lib/gear"
import { defaultMetrics, CRUCIAL_PIDS } from "@/lib/constants"
import { getChartTheme, TEMP_SENSORS } from "@/lib/chart-theme"
import { mergeCSVFiles } from "@/lib/merge-csv"
import { parseInWorker } from "@/lib/parse-worker"
import { computeSessionMeta } from "@/lib/session-summary"
import { advancePlayback } from "@/lib/playback"
import { computeTimeAxis } from "@/lib/elapsed-time"
import { buildChartXAxis } from "@/lib/chart-x"
import { computeIdleZones } from "@/lib/idle-zones"
import { computeCumulativeDistanceKm } from "@/lib/distance"
import { fuelToLitres, computeFuelEconomyL100km } from "@/lib/fuel"
import { cumulativeForwardTotal } from "@/lib/cumulative"
import { analyzeDataHealth } from "@/lib/data-health"
import { TRANSMISSION_PRESETS } from "@/lib/transmission-presets"
import { normalizeTransmissionConfig } from "@/lib/transmission"
import { isTransmissionConfigValid } from "@/lib/transmission-validate"

const DEFAULT_TRANSMISSION: TransmissionConfig = {
  gearRatios: { 1: 3.538, 2: 1.92, 3: 1.323, 4: 1.026, 5: 0.822, 6: 0.681 },
  finalDrive: 4.35,
  tyreDiameterMm: 647,
  shiftRpm: 6900,
  numberOfGears: 6,
}

// Client gate for the optional share UI. The build-time env flag is the SINGLE source of truth:
// a product decision to keep sharing off must not be bypassable from the browser (e.g. a DevTools
// localStorage flag), even when the server backend happens to be configured. Tests exercise the
// enabled flow through a dedicated build with NEXT_PUBLIC_SHARING_ENABLED=true (see the "share-enabled"
// Playwright project), never a client override.
export const SHARING_ENABLED = process.env.NEXT_PUBLIC_SHARING_ENABLED === "true"

export function useObdSession() {
  const [data, setData] = useState<DataPoint[]>([])
  const [metrics, setMetrics] = useState<MetricConfig[]>(defaultMetrics)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [timeRange, setTimeRange] = useState([0, 100])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importedFileNames, setImportedFileNames] = useState<string[]>([])
  const [ignoreIdle, setIgnoreIdle] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOption, setSortOption] = useState<"default" | "alphabetical">("default")
  const [selectedTempSensors, setSelectedTempSensors] = useState<string[]>(["coolantTemp", "intakeTemp"])
  const [selectedPIDs, setSelectedPIDs] = useState<string[]>([])
  const [showEmptyPIDs, setShowEmptyPIDs] = useState(false)
  const [pidAnalysisHoveredTimeKey, setPidAnalysisHoveredTimeKey] = useState<number | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [speedUnit, setSpeedUnit] = useState<"km/h" | "mph">("km/h")
  const [tripDurationUnit, setTripDurationUnit] = useState<string>("min")
  const [overviewXMode, setOverviewXMode] = useState<"time" | "distance">("time")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const overviewChartRef = useRef<HTMLDivElement>(null)

  // --- Sharing ---
  const [rawCsv, setRawCsv] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [sharedNotice, setSharedNotice] = useState<{ expiresAt: string | null } | null>(null)
  const [pendingShareId, setPendingShareId] = useState<string | null>(null)
  const sharedLoadedRef = useRef(false)
  const [showMissingPIDsDialog, setShowMissingPIDsDialog] = useState(false)

  // --- Toast ---
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000)
  }, [])

  // --- Theme ---
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
  const chartTheme = useMemo(() => getChartTheme(theme), [theme])

  const [missingPIDs, setMissingPIDs] = useState<{ missing: typeof CRUCIAL_PIDS; hasCriticalMissing: boolean }>({
    missing: [],
    hasCriticalMissing: false,
  })

  // --- Transmission config (persisted) ---
  const [transmissionConfig, setTransmissionConfig] = useState<TransmissionConfig>(DEFAULT_TRANSMISSION)
  const configLoadedRef = useRef(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("obd.transmissionConfig")
      if (saved) {
        // Validate the complete schema before trusting persisted state — a partial or
        // out-of-range object would corrupt gear estimation, so fall back to defaults instead.
        const cfg = normalizeTransmissionConfig(JSON.parse(saved))
        if (cfg && isTransmissionConfigValid(cfg)) {
          setTransmissionConfig(cfg)
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

  const transmissionPresets = TRANSMISSION_PRESETS

  // Live refs so the playback loop reads current values without restarting every frame.
  const timeRangeRef = useRef(timeRange)
  const rateRef = useRef(playbackRate)
  const currentTimeRef = useRef(currentTime)
  const elapsedRef = useRef<number[]>([])
  const trustedRef = useRef(false)
  const playbackAccRef = useRef(0)

  // --- Playback (drift-resistant, real-time when timestamps are trustworthy) ---
  // A requestAnimationFrame loop maps real wall-clock time onto the log's timeline via
  // advancePlayback(): trustworthy logs play at their true per-sample pace (irregular sampling
  // and gaps included, gaps capped), untrustworthy logs fall back to a fixed sample cadence.
  useEffect(() => {
    if (!isPlaying || data.length === 0) return
    playbackAccRef.current = 0
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dtMs = now - last
      last = now
      const [lo, hi] = timeRangeRef.current
      const res = advancePlayback({
        elapsed: elapsedRef.current,
        trustworthy: trustedRef.current,
        index: currentTimeRef.current,
        lo,
        hi,
        rate: rateRef.current,
        dtMs,
        acc: playbackAccRef.current,
      })
      playbackAccRef.current = res.acc
      if (res.index !== currentTimeRef.current) {
        currentTimeRef.current = res.index
        setCurrentTime(res.index)
      }
      if (res.atEnd) {
        // Preserve prior behaviour: stop at the window end and rewind the cursor to its start.
        setIsPlaying(false)
        currentTimeRef.current = lo
        setCurrentTime(lo)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, data.length])

  // Re-clamp currentTime into the active timeRange whenever the user narrows the window.
  useEffect(() => {
    setCurrentTime((t) => Math.min(Math.max(t, timeRange[0]), timeRange[1]))
  }, [timeRange])

  // Keyboard shortcuts for playback/scrubbing.
  useEffect(() => {
    if (data.length === 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      // A focused slider thumb handles its own arrow keys; without this the global handler would
      // double-step it (thumb + window both moving the cursor).
      if (target?.getAttribute?.("role") === "slider") return
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

  const emptyPidKeys = useMemo(() => {
    const empty = new Set<string>()
    for (const metric of metrics) {
      const key = metric.key as string
      const allEmpty = data.every((point) => {
        const value = (point as Record<string, unknown>)[key]
        return value === 0 || value === null || value === undefined || isNaN(value as number)
      })
      if (allEmpty) empty.add(key)
    }
    return empty
  }, [data, metrics])

  const isEmptyPID = useCallback((metric: MetricConfig) => emptyPidKeys.has(metric.key as string), [emptyPidKeys])

  const resetDataState = useCallback(() => {
    setMetrics([])
    setData([])
    setTimeRange([0, 0])
    setCurrentTime(0)
    setMissingPIDs({ missing: [], hasCriticalMissing: false })
    setRawCsv(null)
  }, [])

  const parseCSV = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setSharedNotice(null)
      try {
        const text = await file.text()
        const result = await parseInWorker(text, transmissionConfig)

        if (result.status === "empty") {
          resetDataState()
          showToast("The selected CSV file is empty or contains no data.")
          return
        }
        if (result.status === "headerOnly") {
          resetDataState()
          showToast("The CSV file has a header row but no data rows.")
          return
        }
        if (result.status === "error") {
          resetDataState()
          showToast("Couldn't parse this CSV file. Check the format and try again.")
          return
        }

        setRawCsv(text)
        setSpeedUnit(result.speedUnit)
        setTripDurationUnit(result.tripDurationUnit)
        setMetrics(result.metrics)
        setMissingPIDs(result.missingPIDs)
        if (result.missingPIDs.missing.length > 0) {
          setShowMissingPIDsDialog(true)
        }
        setData(result.data)
        setTimeRange([0, Math.max(0, result.data.length - 1)])
        setCurrentTime(0)
        setSelectedPIDs([])
        setActiveTab("overview")
      } catch (error) {
        console.error("Error parsing CSV:", error)
        resetDataState()
        showToast("Couldn't parse this CSV file. Check the format and try again.")
      } finally {
        setIsLoading(false)
      }
    },
    [transmissionConfig, showToast, resetDataState],
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

  const handleExportCsv = useCallback(() => {
    if (data.length === 0) return
    const csv = buildWindowCsv(data, metrics, timeRange[0], timeRange[1])
    const base = (importedFileNames[0] || "obd-log").replace(/\.csv$/i, "")
    downloadCsv(csv, `${base}-export.csv`)
    showToast("Exported the current window as CSV.")
  }, [data, metrics, timeRange, importedFileNames, showToast])

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

  useEffect(() => {
    if (!SHARING_ENABLED || sharedLoadedRef.current) return
    const shareId = new URLSearchParams(window.location.search).get("share")
    if (!shareId) return
    sharedLoadedRef.current = true
    setPendingShareId(shareId)
  }, [])

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
        setSharedNotice({ expiresAt: json.expiresAt ?? null })
      } catch {
        showToast("Couldn't load the shared log.")
      } finally {
        setIsLoading(false)
      }
    },
    [parseCSV, showToast],
  )

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

  const importFiles = useCallback(
    async (fileList: File[]) => {
      const csvFiles = fileList.filter((f) => f.name.toLowerCase().endsWith(".csv"))
      if (csvFiles.length === 0) return
      if (csvFiles.length === 1) {
        setSelectedFile(csvFiles[0])
        setImportedFileNames([csvFiles[0].name])
        parseCSV(csvFiles[0])
      } else {
        const ordered = determineFileOrder(csvFiles)
        try {
          // Merge FIRST — only mutate session state once it succeeds, so an incompatible batch
          // leaves any currently-loaded log (and its file-name chips) untouched.
          const merged = await mergeCSVFiles(ordered)
          setImportedFileNames(ordered.map((f) => f.name))
          setSelectedFile(merged)
          parseCSV(merged)
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Failed to merge CSV files")
        }
      }
    },
    [parseCSV, showToast],
  )

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      await importFiles(Array.from(event.dataTransfer.files))
    },
    [importFiles],
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
      await importFiles(Array.from(event.target.files || []))
    },
    [importFiles],
  )

  const toggleMetric = useCallback((key: string) => {
    setMetrics((prev) => prev.map((metric) => (metric.key === key ? { ...metric, enabled: !metric.enabled } : metric)))
  }, [])
  const setMetricEnabled = useCallback((key: string, enabled: boolean) => {
    setMetrics((prev) => prev.map((metric) => (metric.key === key ? { ...metric, enabled } : metric)))
  }, [])
  // Set the EXACT set of enabled metrics (used by the Overview channel presets / clear).
  const setEnabledMetricKeys = useCallback((keys: string[]) => {
    const set = new Set(keys)
    setMetrics((prev) => prev.map((metric) => ({ ...metric, enabled: set.has(metric.key as string) })))
  }, [])

  const filteredMetrics = useMemo(() => {
    let result = metrics
    if (searchQuery) {
      result = result.filter(
        (metric) =>
          metric.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (metric.originalName && metric.originalName.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (metric.unit && metric.unit.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    }
    if (!showEmptyPIDs) {
      result = result.filter((metric) => !isEmptyPID(metric))
    }
    if (sortOption === "alphabetical") {
      result = [...result].sort((a, b) => a.label.localeCompare(b.label))
    }
    return result
  }, [metrics, searchQuery, sortOption, showEmptyPIDs, isEmptyPID])

  const filteredData = useMemo(() => data.slice(timeRange[0], timeRange[1] + 1), [data, timeRange])

  const gpsPointCount = useMemo(
    () =>
      data.filter(
        (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
      ).length,
    [data],
  )

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

  const altitudeKey = useMemo(() => {
    const m = metrics.find(
      (mc) =>
        mc.label === "Altitude" ||
        /altitude|elevation/i.test(mc.originalName || "") ||
        (mc.unit === "m" && /alt/i.test(mc.label)),
    )
    return m ? (m.key as string) : null
  }, [metrics])

  // Real elapsed-time axis (or index fallback). Computed once from the full log so chart points,
  // playback and the session summary all share one definition of "time".
  const timeAxis = useMemo(() => computeTimeAxis(data.map((d) => d.timestamp)), [data])
  const chartXAxis = useMemo(() => buildChartXAxis(timeAxis), [timeAxis])

  // Unit of an imported "Trip Distance" channel, so miles aren't mislabelled as km.
  const tripDistanceUnit = useMemo(() => {
    const m = metrics.find((mc) => /trip\s*distance/i.test(mc.originalName || mc.label))
    return m?.unit
  }, [metrics])

  // Unit of an imported "Trip Fuel" channel (litres vs gallons), so fuel economy is dimensionally
  // correct. Excludes "Trip Fuel Economy" columns, which are a rate, not a quantity.
  const tripFuelUnit = useMemo(() => {
    const m = metrics.find(
      (mc) => /trip\s*fuel/i.test(mc.originalName || mc.label) && !/econom/i.test(mc.originalName || mc.label),
    )
    return m?.unit
  }, [metrics])

  // Cumulative distance for the current window, computed by the pure helper (real Δt integration,
  // unit-correct, trip-channel aware). `available` gates distance mode; `approximate` labels it.
  const distanceResult = useMemo(
    () =>
      computeCumulativeDistanceKm({
        speeds: filteredData.map((p) => (typeof p.speed === "number" && !isNaN(p.speed) ? p.speed : 0)),
        speedUnit,
        elapsed: filteredData.map((p) => timeAxis.elapsed[p.time] ?? p.time),
        trustedTime: timeAxis.trustworthy,
        tripDistance: filteredData.map((p) => p.tripDistance),
        tripDistanceUnit,
      }),
    [filteredData, speedUnit, timeAxis, tripDistanceUnit],
  )

  // FULL-session distance (whole log, not the current window) — this is what the Session Summary
  // reports. It uses the SAME pure policy as the chart/window result, so units are correct and an
  // unusable trip counter can't override valid speed/time integration.
  const summaryDistanceResult = useMemo(
    () =>
      computeCumulativeDistanceKm({
        speeds: data.map((p) => (typeof p.speed === "number" && !isNaN(p.speed) ? p.speed : 0)),
        speedUnit,
        elapsed: data.map((p) => timeAxis.elapsed[p.time] ?? p.time),
        trustedTime: timeAxis.trustworthy,
        tripDistance: data.map((p) => p.tripDistance),
        tripDistanceUnit,
      }),
    [data, speedUnit, timeAxis, tripDistanceUnit],
  )

  // Full per-sample chart rows (numeric-coerced metrics + dist/elapsed/originalIndex), NOT
  // downsampled. This is the single source of truth for every display dataset AND for idle-zone
  // detection, so idle zones are computed before any downsampling can drop a short idle period.
  const processedData = useMemo(() => {
    return filteredData.map((point, i) => {
      const chartPoint: DataPoint = { ...point }
      metrics.forEach((metricConfig) => {
        const key = metricConfig.key as string
        const value = (point as Record<string, unknown>)[key]
        chartPoint[key] = typeof value === "number" && !isNaN(value) ? value : 0
      })
      chartPoint.dist = distanceResult.dist[i] ?? 0
      // Real elapsed seconds for this sample (keyed by its ORIGINAL index in the full log).
      chartPoint.elapsed = timeAxis.trustworthy ? timeAxis.elapsed[point.time] ?? point.time : point.time
      // Explicit original-row index, preserved through downsampling for hover/selection mapping.
      chartPoint.originalIndex = point.time
      return chartPoint
    })
  }, [filteredData, metrics, timeAxis, distanceResult])

  // Time-domain dataset (elapsed seconds when timestamps are trusted, else sample index) used by
  // Performance / Engine / Channels and by Overview in time mode. Downsampled against the SAME
  // x-domain those charts plot, so point selection matches the rendered spacing on irregular logs.
  const finalChartData = useMemo(() => {
    if (processedData.length <= 500) return processedData
    const getX = timeAxis.trustworthy ? (p: DataPoint) => (p.elapsed as number) : (_p: DataPoint, i: number) => i
    return lttbDownsample(processedData, 500, (p) => p.rpm || p.speed || 0, getX)
  }, [processedData, timeAxis])

  // Distance mode is offered only when distance is actually available (a usable trip channel or
  // trusted time) and the vehicle covered ground — never guessed from an unknown cadence.
  const hasDistance = useMemo(
    () =>
      distanceResult.available &&
      processedData.length > 1 &&
      (processedData[processedData.length - 1].dist ?? 0) > 0.05,
    [processedData, distanceResult],
  )
  const effectiveXMode: "time" | "distance" = overviewXMode === "distance" && hasDistance ? "distance" : "time"

  // Overview dataset: in DISTANCE mode, downsample against cumulative distance so the retained
  // points match the rendered (distance) spacing rather than the time spacing. Otherwise reuse the
  // time-domain dataset.
  const overviewChartData = useMemo(() => {
    if (effectiveXMode !== "distance") return finalChartData
    if (processedData.length <= 500) return processedData
    return lttbDownsample(processedData, 500, (p) => p.rpm || p.speed || 0, (p) => (p.dist as number))
  }, [effectiveXMode, finalChartData, processedData])

  const elevationData = useMemo(() => {
    if (!altitudeKey || !distanceResult.available) return []
    // Elevation plots against distance, so select points against the distance domain too.
    const base =
      processedData.length > 500
        ? lttbDownsample(
            processedData,
            500,
            (p) => Number((p as Record<string, unknown>)[altitudeKey]) || 0,
            (p) => (p.dist as number),
          )
        : processedData
    const pts = base
      .map((p) => ({ dist: p.dist ?? 0, time: p.time, altitude: Number((p as Record<string, unknown>)[altitudeKey]) }))
      .filter((p) => Number.isFinite(p.altitude))
    if (pts.length < 2) return []
    const alts = pts.map((p) => p.altitude)
    const min = safeMin(alts)
    const max = safeMax(alts)
    return max - min < 1 ? [] : pts
  }, [processedData, altitudeKey, distanceResult])

  const accelRuns = useMemo(() => {
    if (data.length < 3) return []
    const times = parseLogTimeSeconds(data.map((d) => d.timestamp))
    if (!times) return []
    const toKmh = speedUnit === "mph" ? 1.609344 : 1
    const speedsKmh = data.map((d) => (typeof d.speed === "number" && !isNaN(d.speed) ? d.speed * toKmh : 0))
    return detectAccelRuns(times, speedsKmh)
  }, [data, speedUnit])

  // Idle intervals are detected on the FULL (non-downsampled) data so a short idle period between
  // two retained points can't be dropped or shifted by downsampling. Bounds are in the same time
  // x-domain the charts plot (elapsed seconds when trusted, else sample index).
  const idleZones = useMemo(
    () => (ignoreIdle ? computeIdleZones(processedData, chartXAxis.key) : []),
    [processedData, ignoreIdle, chartXAxis],
  )

  const enabledMetrics = useMemo(() => metrics.filter((m) => m.enabled), [metrics])
  const currentDataPoint = data[currentTime] || null

  // Temp-sensor colours/labels come from the central TEMP_SENSORS palette; we only keep the
  // sensors this log actually recorded.
  const tempSensors = useMemo(
    () => TEMP_SENSORS.filter((s) => data.some((d) => d[s.key])),
    [data],
  )

  const stats = useMemo(() => {
    if (data.length === 0)
      return {
        maxRPM: 0, maxSpeed: 0, maxBoost: 0, avgCoolant: 0, avgIntakeTemp: 0,
        maxPower: 0, maxTorque: 0, avgSpeed: 0, avgRPM: 0,
      }
    const statsData = ignoreIdle ? data.filter((d) => (d.speed || 0) > 0) : data
    const validRPMs = statsData.map((d) => d.rpm || 0).filter((v) => v > 0)
    const validBoosts = statsData.map((d) => d.boost || 0).filter((v) => !isNaN(v))
    const validPowers = statsData.map((d) => d.enginePower || 0).filter((v) => v > 0)
    const validTorques = statsData.map((d) => d.engineTorque || 0).filter((v) => v > 0)
    const validCoolants = statsData.map((d) => d.coolantTemp ?? NaN).filter((v) => !isNaN(v))
    const validIntakes = statsData.map((d) => d.intakeTemp ?? NaN).filter((v) => !isNaN(v))
    const validSpeeds = statsData.map((d) => d.speed || d.gpsSpeed || 0).filter((v) => v > 0)
    const speedsForAvg = statsData.map((d) => d.speed || d.gpsSpeed || 0)
    const maxSpeedFromField = statsData.map((d) => d.maxSpeed || 0).filter((v) => v > 0)
    const fieldMax = maxSpeedFromField.length > 0 ? safeMax(maxSpeedFromField) : 0
    const traceMax = validSpeeds.length > 0 ? safeMax(validSpeeds) : 0
    const maxSpeed = Math.max(fieldMax, traceMax)
    return {
      maxRPM: validRPMs.length > 0 ? safeMax(validRPMs) : 0,
      maxSpeed,
      maxBoost: validBoosts.length > 0 ? safeMax(validBoosts) : 0,
      avgCoolant: validCoolants.length > 0 ? validCoolants.reduce((s, v) => s + v, 0) / validCoolants.length : 0,
      avgIntakeTemp: validIntakes.length > 0 ? validIntakes.reduce((s, v) => s + v, 0) / validIntakes.length : 0,
      maxPower: validPowers.length > 0 ? safeMax(validPowers) : 0,
      maxTorque: validTorques.length > 0 ? safeMax(validTorques) : 0,
      avgSpeed: speedsForAvg.length > 0 ? speedsForAvg.reduce((s, v) => s + v, 0) / speedsForAvg.length : 0,
      avgRPM: validRPMs.length > 0 ? validRPMs.reduce((s, v) => s + v, 0) / validRPMs.length : 0,
    }
  }, [data, ignoreIdle])

  const tripTotals = useMemo(() => {
    // Distance comes from the physically-correct full-session helper (km, unit-normalised), NOT the
    // raw Trip Distance column — which may be miles and was previously mislabelled as km.
    const distanceKm = summaryDistanceResult.available
      ? summaryDistanceResult.dist[summaryDistanceResult.dist.length - 1] ?? null
      : null
    // Cumulative counters: exclude the initial baseline (a log may start mid-trip) and treat drops
    // as re-baselines. See lib/cumulative.ts.
    const rawFuel = cumulativeForwardTotal(data.map((p) => p.tripFuel))
    const fuel = rawFuel // kept in the log's own unit for the "Fuel" readout
    const rawDuration = cumulativeForwardTotal(data.map((p) => p.tripDuration))
    const durationUnit = tripDurationUnit.toLowerCase()
    const durationMinutes =
      rawDuration == null
        ? null
        : /^(s|sec|second)/.test(durationUnit)
          ? rawDuration / 60
          : /^(h|hr|hour)/.test(durationUnit)
            ? rawDuration * 60
            : rawDuration
    // L/100km strictly from litres and kilometres; null (hidden) when units can't support it.
    const litres = rawFuel != null ? fuelToLitres(rawFuel, tripFuelUnit) : null
    const fuelEconomy = computeFuelEconomyL100km(litres, distanceKm)
    return {
      distance: distanceKm,
      distanceSource: summaryDistanceResult.source,
      fuel,
      fuelUnit: tripFuelUnit ?? "L",
      duration: durationMinutes,
      fuelEconomy,
    }
  }, [data, tripDurationUnit, summaryDistanceResult, tripFuelUnit])

  const autoDetection = useMemo(() => (data.length > 100 ? detectGearRatios(data, speedUnit) : null), [data, speedUnit])

  const addPID = useCallback(
    (pidKey: string) => setSelectedPIDs((prev) => (prev.includes(pidKey) ? prev : [...prev, pidKey])),
    [],
  )
  const removePID = useCallback((pidKey: string) => {
    setSelectedPIDs((prev) => prev.filter((pid) => pid !== pidKey))
  }, [])

  // --- New derived metadata: time axis, session summary, data health ---
  const sessionMeta = useMemo(() => computeSessionMeta(data), [data])
  // (timeAxis is computed earlier, above finalChartData, and shared here.)

  // Keep the playback loop's refs pointed at the latest values (no dependency array: runs after
  // every render), so the rAF loop reads current range/rate/position/time-axis without restarting.
  useEffect(() => {
    timeRangeRef.current = timeRange
    rateRef.current = playbackRate
    currentTimeRef.current = currentTime
    elapsedRef.current = timeAxis.elapsed
    trustedRef.current = timeAxis.trustworthy
  })

  const healthFindings = useMemo(
    () => analyzeDataHealth(data, metrics, missingPIDs, speedUnit),
    [data, metrics, missingPIDs, speedUnit],
  )

  // Commit a transmission config (from the dialog's validated draft): persist it and recompute
  // per-row gear with the SAME config in one step, so recalculation never races the state update.
  const applyTransmission = useCallback(
    (cfg: TransmissionConfig) => {
      setTransmissionConfig(cfg)
      if (data.length === 0) return
      let changed = false
      const updatedData = data.map((point) => {
        const newGear = point.speed && point.rpm ? calculateGear(point.speed, point.rpm, cfg, speedUnit) : point.gear
        if (newGear === point.gear) return point
        changed = true
        return { ...point, gear: newGear }
      })
      if (changed) setData(updatedData)
    },
    [data, speedUnit],
  )

  return {
    // data + import
    data, metrics, selectedFile, importedFileNames, speedUnit, tripDurationUnit, missingPIDs, rawCsv,
    isLoading, isDragOver, fileInputRef,
    parseCSV, loadSampleData, handleFileUpload, handleDrop, handleDragOver, handleDragLeave,
    // playback
    currentTime, setCurrentTime, isPlaying, setIsPlaying, timeRange, setTimeRange, playbackRate, setPlaybackRate,
    currentDataPoint,
    // ui
    activeTab, setActiveTab, ignoreIdle, setIgnoreIdle, theme, toggleTheme, chartTheme,
    overviewXMode, setOverviewXMode, effectiveXMode, hasDistance, overviewChartRef, chartXAxis,
    // channels / metrics
    searchQuery, setSearchQuery, sortOption, setSortOption, showEmptyPIDs, setShowEmptyPIDs,
    filteredMetrics, isEmptyPID, toggleMetric, setMetricEnabled, setEnabledMetricKeys, enabledMetrics,
    selectedPIDs, addPID, removePID, setSelectedPIDs, pidAnalysisHoveredTimeKey, setPidAnalysisHoveredTimeKey,
    // derived data
    filteredData, finalChartData, overviewChartData, stats, tripTotals, accelRuns, idleZones, tempSensors, gearDistribution,
    altitudeKey, elevationData, gpsPointCount, sessionMeta, timeAxis, healthFindings,
    selectedTempSensors, setSelectedTempSensors,
    // transmission
    transmissionConfig, setTransmissionConfig, transmissionPresets, autoDetection, applyTransmission,
    DEFAULT_TRANSMISSION,
    // sharing
    isSharing, shareDialogOpen, setShareDialogOpen, shareUrl, shareExpiresAt, shareCopied,
    sharedNotice, pendingShareId, showMissingPIDsDialog, setShowMissingPIDsDialog,
    handleShare, copyShareUrl, loadSharedLog, dismissSharedPrompt, handleExportCsv,
    // toast
    toastMessage, showToast,
  }
}

export type ObdSession = ReturnType<typeof useObdSession>
