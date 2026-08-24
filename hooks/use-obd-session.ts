"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DataPoint, MetricConfig, TransmissionConfig } from "@/types/obd"
import { parseLogTimeSeconds, detectAccelRuns } from "@/lib/accel-runs"
import { safeMax, safeMin } from "@/lib/stats"
import { lttbDownsample } from "@/lib/downsample"
import { buildWindowCsv, downloadCsv, determineFileOrder } from "@/lib/csv"
import { calculateGear, detectGearRatios } from "@/lib/gear"
import { defaultMetrics, CRUCIAL_PIDS } from "@/lib/constants"
import { getChartTheme } from "@/lib/chart-theme"
import { mergeCSVFiles } from "@/lib/merge-csv"
import { parseInWorker } from "@/lib/parse-worker"
import { computeSessionMeta } from "@/lib/session-summary"
import { advancePlayback } from "@/lib/playback"
import { computeTimeAxis } from "@/lib/elapsed-time"
import { buildChartXAxis } from "@/lib/chart-x"
import { analyzeDataHealth } from "@/lib/data-health"
import { TRANSMISSION_PRESETS } from "@/lib/transmission-presets"

const DEFAULT_TRANSMISSION: TransmissionConfig = {
  gearRatios: { 1: 3.538, 2: 1.92, 3: 1.323, 4: 1.026, 5: 0.822, 6: 0.681 },
  finalDrive: 4.35,
  tyreDiameterMm: 647,
  shiftRpm: 6900,
  numberOfGears: 6,
}

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
        setImportedFileNames(ordered.map((f) => f.name))
        try {
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

  const finalChartData = useMemo(() => {
    const hasTripDistance = filteredData.some(
      (p) => typeof p.tripDistance === "number" && !isNaN(p.tripDistance as number),
    )
    let cumDist = 0
    let prevTrip: number | null = null
    const processed = filteredData.map((point) => {
      const chartPoint: DataPoint = { ...point }
      metrics.forEach((metricConfig) => {
        const key = metricConfig.key as string
        const value = (point as Record<string, unknown>)[key]
        chartPoint[key] = typeof value === "number" && !isNaN(value) ? value : 0
      })
      if (hasTripDistance) {
        const td =
          typeof point.tripDistance === "number" && !isNaN(point.tripDistance as number)
            ? (point.tripDistance as number)
            : prevTrip ?? 0
        if (prevTrip !== null) {
          const delta = td - prevTrip
          if (delta >= 0 && delta < 2) cumDist += delta
        }
        prevTrip = td
      } else {
        const spd = typeof point.speed === "number" && !isNaN(point.speed) ? point.speed : 0
        cumDist += spd / 3600
      }
      chartPoint.dist = Math.round(cumDist * 1000) / 1000
      // Real elapsed seconds for this sample (keyed by its ORIGINAL index in the full log, which
      // `time` preserves through slicing and downsampling). Falls back to the index when the log
      // has no trustworthy timestamps.
      chartPoint.elapsed = timeAxis.trustworthy ? timeAxis.elapsed[point.time] ?? point.time : point.time
      return chartPoint
    })
    if (processed.length > 500) {
      return lttbDownsample(processed, 500, (p) => p.rpm || p.speed || 0)
    }
    return processed
  }, [filteredData, metrics, timeAxis])

  const hasDistance = useMemo(
    () => finalChartData.length > 1 && (finalChartData[finalChartData.length - 1].dist ?? 0) > 0.05,
    [finalChartData],
  )
  const effectiveXMode: "time" | "distance" = overviewXMode === "distance" && hasDistance ? "distance" : "time"

  const elevationData = useMemo(() => {
    if (!altitudeKey) return []
    const pts = finalChartData
      .map((p) => ({ dist: p.dist ?? 0, time: p.time, altitude: Number((p as Record<string, unknown>)[altitudeKey]) }))
      .filter((p) => Number.isFinite(p.altitude))
    if (pts.length < 2) return []
    // pts derives from finalChartData (downsampled to ≤500), but use the bounded reducers
    // for consistency and to stay safe if that cap ever changes.
    const alts = pts.map((p) => p.altitude)
    const min = safeMin(alts)
    const max = safeMax(alts)
    return max - min < 1 ? [] : pts
  }, [finalChartData, altitudeKey])

  const accelRuns = useMemo(() => {
    if (data.length < 3) return []
    const times = parseLogTimeSeconds(data.map((d) => d.timestamp))
    if (!times) return []
    const toKmh = speedUnit === "mph" ? 1.609344 : 1
    const speedsKmh = data.map((d) => (typeof d.speed === "number" && !isNaN(d.speed) ? d.speed * toKmh : 0))
    return detectAccelRuns(times, speedsKmh)
  }, [data, speedUnit])

  const idleZones = useMemo(() => {
    if (!ignoreIdle || finalChartData.length === 0) return []
    // Zone bounds are expressed in the SAME x domain the charts plot (elapsed seconds when
    // timestamps are trustworthy, else sample index), so ReferenceArea bands line up.
    const xk = chartXAxis.key
    const xOf = (p: DataPoint) => (p[xk] as number) ?? p.time
    const zones: { x1: number; x2: number }[] = []
    let zoneStart: number | null = null
    for (let i = 0; i < finalChartData.length; i++) {
      const isIdle = (finalChartData[i].speed || 0) === 0
      if (isIdle && zoneStart === null) {
        zoneStart = xOf(finalChartData[i])
      } else if (!isIdle && zoneStart !== null) {
        zones.push({ x1: zoneStart, x2: xOf(finalChartData[i]) })
        zoneStart = null
      }
    }
    if (zoneStart !== null) {
      zones.push({ x1: zoneStart, x2: xOf(finalChartData[finalChartData.length - 1]) })
    }
    return zones
  }, [finalChartData, ignoreIdle, chartXAxis])

  const enabledMetrics = useMemo(() => metrics.filter((m) => m.enabled), [metrics])
  const currentDataPoint = data[currentTime] || null

  const tempSensors = useMemo(() => {
    const sensors: { key: string; label: string; color: string }[] = []
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
    const durationUnit = tripDurationUnit.toLowerCase()
    const durationMinutes =
      rawDuration == null
        ? null
        : /^(s|sec|second)/.test(durationUnit)
          ? rawDuration / 60
          : /^(h|hr|hour)/.test(durationUnit)
            ? rawDuration * 60
            : rawDuration
    const fuelEconomy = fuel != null && distance != null && distance > 0 ? (fuel / distance) * 100 : null
    return { distance, fuel, duration: durationMinutes, fuelEconomy }
  }, [data, tripDurationUnit])

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
    filteredData, finalChartData, stats, tripTotals, accelRuns, idleZones, tempSensors, gearDistribution,
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
