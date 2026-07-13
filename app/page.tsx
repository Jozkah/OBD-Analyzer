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
  Minus,
  Maximize2,
  Download,
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

// Toggles the optional "share a log via an expiring link" feature. The backend must also
// be configured (see .env.example / README → "Sharing logs"). When false, the Share
// button is hidden and the app stays 100% client-side.
const SHARING_ENABLED = process.env.NEXT_PUBLIC_SHARING_ENABLED === "true"

function safeMax(arr: number[]): number {
  return arr.reduce((a, b) => (b > a ? b : a), -Infinity)
}
function safeMin(arr: number[]): number {
  return arr.reduce((a, b) => (b < a ? b : a), Infinity)
}

// Largest-Triangle-Three-Buckets downsampling. Unlike uniform "keep every Nth point"
// decimation, LTTB selects the points that best preserve the visual outline of a driver
// series, so short transient spikes (e.g. an RPM flare or boost blip) survive instead of
// being silently dropped between kept samples. Keeps whole rows, always keeps the first
// and last point, and returns the input unchanged when it's already at/under the budget.
function lttbDownsample<T>(points: T[], threshold: number, getY: (p: T) => number): T[] {
  const n = points.length
  if (threshold >= n || threshold < 3) return points
  const sampled: T[] = [points[0]]
  const bucketSize = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    // Average point of the NEXT bucket (used to form the triangle).
    const avgStart = Math.floor((i + 1) * bucketSize) + 1
    const avgEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)
    let avgX = 0
    let avgY = 0
    const avgLen = avgEnd - avgStart || 1
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += j
      avgY += getY(points[j])
    }
    avgX /= avgLen
    avgY /= avgLen
    // Pick the point in THIS bucket that forms the largest triangle with a and the next avg.
    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1
    const ay = getY(points[a])
    let maxArea = -1
    let chosen = rangeStart
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((a - avgX) * (getY(points[j]) - ay) - (a - j) * (avgY - ay))
      if (area > maxArea) {
        maxArea = area
        chosen = j
      }
    }
    sampled.push(points[chosen])
    a = chosen
  }
  sampled.push(points[n - 1])
  return sampled
}

const tooltipFormatter = (value: number | string | undefined): string | number =>
  typeof value === "number" ? Number(value.toFixed(2)) : value ?? ""

// Parse a single CSV line, respecting double-quoted fields (which may contain
// commas) and stripping any trailing carriage return from CRLF-encoded files.
function parseCsvLine(line: string): string[] {
  // Defense-in-depth: never read .length off undefined/null (e.g. lines[0] on an
  // empty file). Callers also guard upstream, but this keeps the function safe.
  if (line == null) return []
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      result.push(current)
      current = ""
    } else if (char !== "\r") {
      current += char
    }
  }
  result.push(current)
  return result
}

interface DataPoint {
  time: number
  timestamp: string
  rpm: number
  speed: number
  throttle: number
  brake: number
  boost: number
  coolantTemp: number
  intakeTemp: number
  fuelRate: number
  latitude?: number
  longitude?: number
  gear?: number
  steering?: number
  enginePower?: number
  engineTorque?: number
  afr?: number
  ignitionAdvance?: number
  catTemp?: number
  oilTemp?: number
  transTemp?: number
  exhaustTemp?: number
  tripDuration?: number
  tripDistance?: number
  tripFuel?: number
  tripFuelEconomy?: number
  maxSpeed?: number
  // Allow dynamic col_X properties
  [key: string]: any
}

// Update the MetricConfig interface to include originalName
interface MetricConfig {
  key: keyof DataPoint | string
  label: string
  color: string
  unit: string
  enabled: boolean
  scale?: number
  originalName?: string
}

const defaultMetrics: MetricConfig[] = [
  { key: "rpm", label: "RPM", color: "#ef4444", unit: "RPM", enabled: true, scale: 1 },
  { key: "speed", label: "Speed", color: "#22c55e", unit: "km/h", enabled: true, scale: 1 },
  { key: "throttle", label: "Throttle", color: "#eab308", unit: "%", enabled: true, scale: 1 },
  { key: "brake", label: "Brake", color: "#f97316", unit: "%", enabled: false, scale: 1 },
  { key: "boost", label: "Boost", color: "#06b6d4", unit: "bar", enabled: false, scale: 100 },
  { key: "coolantTemp", label: "Coolant Temp", color: "#8b5cf6", unit: "°C", enabled: false, scale: 1 },
  { key: "enginePower", label: "Power", color: "#ec4899", unit: "hp", enabled: false, scale: 1 },
  { key: "engineTorque", label: "Torque", color: "#84cc16", unit: "N•m", enabled: false, scale: 1 },
]

// Define crucial PIDs that are important for the main functionality
const CRUCIAL_PIDS = [
  {
    name: "Engine RPM",
    keys: ["rpm", "engine_rpm"],
    description: "Essential for performance analysis, gear calculations, and engine monitoring",
    tabs: ["Overview", "Performance", "Engine"],
  },
  {
    name: "Vehicle Speed",
    keys: ["speed", "vehicle_speed", "gps_speed"],
    description: "Required for performance analysis, gear calculations, and GPS tracking",
    tabs: ["Overview", "Performance", "GPS"],
  },
  {
    name: "Throttle Position",
    keys: ["throttle", "throttle_position", "accelerator_position"],
    description: "Important for performance analysis and driving behavior",
    tabs: ["Performance", "Engine"],
  },
  {
    name: "Engine Coolant Temperature",
    keys: ["coolant_temp", "coolant_temperature", "engine_coolant_temperature"],
    description: "Critical for engine health monitoring",
    tabs: ["Overview", "Engine"],
  },
]

// --- Web Mercator helpers + opt-in raster tile sources for the GPS map ----------------
// The default map style is "offline" (no network at all). Selecting Satellite/Street/
// Terrain fetches public raster tiles ONLY then — the one place GPS coordinates leave the
// browser, and only on an explicit click.
const MAP_TILE_PX = 256

function mercatorPx(lat: number, lng: number, z: number) {
  const scale = MAP_TILE_PX * 2 ** z
  const x = ((lng + 180) / 360) * scale
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
  return { x, y }
}

// Inverse of mercatorPx: world pixels -> lat/lng. Used by the pan/zoom handlers to turn a
// screen position back into geographic coordinates.
function mercatorUnpx(x: number, y: number, z: number) {
  const scale = MAP_TILE_PX * 2 ** z
  const lng = (x / scale) * 360 - 180
  const k = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)))
  return { lat, lng }
}

// Largest integer zoom at which the track's bbox still fits the canvas. Tiny/degenerate
// areas clamp to 17 (a level all three providers serve).
function mercatorFitZoom(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  availW: number,
  availH: number,
) {
  const a = mercatorPx(maxLat, minLng, 0)
  const b = mercatorPx(minLat, maxLng, 0)
  const unitW = Math.abs(b.x - a.x) || 1e-9
  const unitH = Math.abs(b.y - a.y) || 1e-9
  const z = Math.floor(Math.min(Math.log2(availW / unitW), Math.log2(availH / unitH)))
  return Math.max(1, Math.min(17, Number.isFinite(z) ? z : 17))
}

type TileStyle = "satellite" | "street" | "terrain"
type MapStyle = "offline" | TileStyle

const MAP_TILE_SOURCES: Record<TileStyle, (z: number, x: number, y: number) => string> = {
  // Esri World Imagery (keyless). Note this provider orders the path as {z}/{y}/{x}.
  satellite: (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  street: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  terrain: (z, x, y) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`,
}

const MAP_ATTRIBUTION: Record<MapStyle, string> = {
  offline: "",
  satellite: "Imagery © Esri",
  street: "© OpenStreetMap contributors",
  terrain: "© OpenTopoMap (CC-BY-SA)",
}

// Enhanced GPS Track Map Component with offline + opt-in tile map bases
function GPSTrackMap({
  data,
  currentTime,
  onNotify,
}: {
  data: DataPoint[]
  currentTime: number
  onNotify?: (msg: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Default to "offline" so the GPS map makes NO external requests unless the user opts in
  // by choosing a real tile style.
  const [mapStyle, setMapStyle] = useState<MapStyle>("offline")
  // Whether the speed column has usable variation. When it doesn't (all-zero/missing
  // speed, or every sample identical), the speed-gradient coloring is meaningless, so
  // we render a neutral track and hide the misleading gradient legend.
  const [hasSpeedVariation, setHasSpeedVariation] = useState(true)
  // Min/max of the speed-colored track, surfaced so the gradient legend can show a numeric
  // scale (WCAG 1.4.1 — don't convey speed by hue alone).
  const [speedRange, setSpeedRange] = useState<{ min: number; max: number }>({ min: 0, max: 0 })
  // True when every GPS fix sits within a few metres (parked car / single location), so
  // there is no path to draw — we show a message instead of a confusingly blank map.
  const [trackDegenerate, setTrackDegenerate] = useState(false)
  // Raster tile cache so a redraw (e.g. a 100 ms playback tick, or a style re-select)
  // reuses already-loaded tiles instead of refetching. tileVersion bumps when a new tile
  // finishes loading, triggering a redraw that composites it in.
  // `globalThis.Map` because the lucide-react `Map` icon import shadows the global Map
  // constructor in value position.
  const tileCacheRef = useRef<Map<string, HTMLImageElement>>(new globalThis.Map<string, HTMLImageElement>())
  const tileFailedRef = useRef<Set<string>>(new Set())
  const tileInFlightRef = useRef<Set<string>>(new Set())
  const [tileVersion, setTileVersion] = useState(0)
  // Interactive pan/zoom. `view` is null while auto-fitting the whole track; once the user
  // pans or zooms it holds an explicit { zoom, center } that overrides the fit. projRef
  // mirrors the current projection so the wheel/drag handlers can convert screen <-> world.
  const [view, setView] = useState<{ zoom: number; centerLat: number; centerLng: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const projRef = useRef<{ z: number; originX: number; originY: number; width: number; height: number } | null>(null)
  // Holds the teardown for an in-progress drag so we can also remove the window listeners
  // if the component unmounts mid-drag (or a mouseup is never delivered).
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const gpsData = useMemo(
    // Only discard the true "no fix" sentinel pair (0,0); a finite point that sits
    // exactly on the equator (lat 0) or prime meridian (lng 0) is a valid fix and
    // must stay on the track. Using Number.isFinite also rejects undefined/NaN.
    () =>
      data.filter(
        (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
      ),
    [data],
  )

  // Reset to the auto-fit view whenever a different log is loaded.
  useEffect(() => {
    setView(null)
  }, [gpsData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || gpsData.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    // Only reallocate the canvas backing store when the target pixel size actually
    // changes. Assigning canvas.width/height reallocates the backing store (an
    // expensive op) and would otherwise run on every 100ms playback tick even though
    // only the marker moves. setTransform (below) replaces — not compounds — the
    // matrix, so it is safe to call on every draw whether or not we resized.
    const dpr = window.devicePixelRatio
    const targetW = Math.round(rect.width * dpr)
    const targetH = Math.round(rect.height * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const width = rect.width
    const height = rect.height

    const lats = gpsData.map((d) => d.latitude!)
    const lngs = gpsData.map((d) => d.longitude!)
    const minLat = safeMin(lats)
    const maxLat = safeMax(lats)
    const minLng = safeMin(lngs)
    const maxLng = safeMax(lngs)

    // Degenerate (stationary / single fix): everything within ~20 m, so there is no path
    // to draw — flag it (a message is shown) and skip the polyline.
    const meanLat = (minLat + maxLat) / 2
    const kx = Math.cos((meanLat * Math.PI) / 180) || 1
    const diagMetres = Math.hypot((maxLng - minLng) * kx, maxLat - minLat) * 111_320
    const degenerate = diagMetres < 20
    if (degenerate !== trackDegenerate) setTrackDegenerate(degenerate)

    // Projection: either the user's explicit pan/zoom view, or an auto-fit of the whole
    // track. The SAME projection drives the offline backdrop, the real tiles and the
    // track, so everything stays aligned. projRef mirrors it for the pointer handlers.
    const pad = 28
    let z: number
    let originX: number
    let originY: number
    if (view) {
      z = view.zoom
      const c = mercatorPx(view.centerLat, view.centerLng, z)
      originX = c.x - width / 2
      originY = c.y - height / 2
    } else {
      z = mercatorFitZoom(minLat, maxLat, minLng, maxLng, Math.max(1, width - 2 * pad), Math.max(1, height - 2 * pad))
      const tl = mercatorPx(maxLat, minLng, z)
      const br = mercatorPx(minLat, maxLng, z)
      originX = (tl.x + br.x) / 2 - width / 2
      originY = (tl.y + br.y) / 2 - height / 2
    }
    projRef.current = { z, originX, originY, width, height }
    const toCanvas = (lat: number, lng: number) => {
      const w = mercatorPx(lat, lng, z)
      return { x: w.x - originX, y: w.y - originY }
    }

    // Speed gradient setup. safeMin/safeMax avoid the Math.max(...spread) stack overflow
    // on very large logs.
    const speeds = gpsData.map((d) => d.speed || 0)
    const minSpeed = safeMin(speeds)
    const maxSpeed = safeMax(speeds)
    const speedSpan = maxSpeed - minSpeed
    const speedVaries = speedSpan > 0.001
    if (speedVaries !== hasSpeedVariation) setHasSpeedVariation(speedVaries)
    if (minSpeed !== speedRange.min || maxSpeed !== speedRange.max)
      setSpeedRange({ min: minSpeed, max: maxSpeed })

    // Draws the route + markers on top of whatever backdrop is already on the canvas.
    const paintRoute = () => {
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      const path = gpsData.map((d) => toCanvas(d.latitude!, d.longitude!))
      const neutral = mapStyle === "street" ? "#1d4ed8" : "#67e8f9"
      if (!degenerate && path.length > 1) {
        // Dark casing keeps the bright track legible over satellite imagery.
        ctx.save()
        ctx.strokeStyle = "rgba(0,0,0,0.45)"
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        ctx.restore()

        // Per-segment hue by speed (blue = slow → red = fast).
        for (let i = 0; i < path.length - 1; i++) {
          if (speedVaries) {
            const r = ((gpsData[i].speed || 0) - minSpeed) / speedSpan
            ctx.strokeStyle = `hsl(${(1 - r) * 240}, 90%, 58%)`
          } else {
            ctx.strokeStyle = neutral
          }
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(path[i].x, path[i].y)
          ctx.lineTo(path[i + 1].x, path[i + 1].y)
          ctx.stroke()
        }
      }

      // Live position marker: map currentTime (an index into the FULL data array) onto the
      // next GPS fix at/after it, so it never vanishes on rows that logged no fix.
      const currentPoint = gpsData.find((p) => (p.time ?? 0) >= currentTime) ?? gpsData[gpsData.length - 1]
      if (Number.isFinite(currentPoint?.latitude) && Number.isFinite(currentPoint?.longitude)) {
        const c = toCanvas(currentPoint.latitude!, currentPoint.longitude!)
        ctx.fillStyle = "#ef4444"
        ctx.beginPath()
        ctx.arc(c.x, c.y, 7, 0, 2 * Math.PI)
        ctx.fill()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(c.x, c.y, 9, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // Start / finish (combined into one "S/F" marker when they share a pixel).
      const s = toCanvas(gpsData[0].latitude!, gpsData[0].longitude!)
      const e = toCanvas(gpsData[gpsData.length - 1].latitude!, gpsData[gpsData.length - 1].longitude!)
      const sameSpot = s.x === e.x && s.y === e.y
      ctx.font = "bold 12px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "#22c55e"
      ctx.beginPath()
      ctx.arc(s.x, s.y, 8, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText(sameSpot ? "S/F" : "S", s.x, s.y)
      if (!sameSpot) {
        ctx.fillStyle = "#1f2937"
        ctx.beginPath()
        ctx.arc(e.x, e.y, 8, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = "#ffffff"
        ctx.fillText("F", e.x, e.y)
      }
    }

    // ---- Offline style: no network at all, just a dark backdrop + grid under the track.
    if (mapStyle === "offline") {
      const g = ctx.createLinearGradient(0, 0, 0, height)
      g.addColorStop(0, "#0f172a")
      g.addColorStop(1, "#0b1222")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = "#1e293b"
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 2])
      for (let i = 0; i <= 10; i++) {
        const x = (width / 10) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let i = 0; i <= 10; i++) {
        const y = (height / 10) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      paintRoute()
      return
    }

    // ---- Tile style (opt-in): composite cached tiles now, fetch any that are missing and
    // redraw as they arrive (via tileVersion). Cached tiles mean a 100 ms playback tick
    // redraws with NO network and no flicker. ------------------------------------------
    const src = MAP_TILE_SOURCES[mapStyle]
    const cache = tileCacheRef.current
    const failed = tileFailedRef.current
    const inFlight = tileInFlightRef.current
    const n = 2 ** z
    const x0 = Math.floor(originX / MAP_TILE_PX)
    const x1 = Math.floor((originX + width) / MAP_TILE_PX)
    const y0 = Math.floor(originY / MAP_TILE_PX)
    const y1 = Math.floor((originY + height) / MAP_TILE_PX)

    ctx.fillStyle = "#0b1222"
    ctx.fillRect(0, 0, width, height)
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue
        const wx = ((tx % n) + n) % n
        const url = src(z, wx, ty)
        const img = cache.get(url)
        if (img) {
          ctx.drawImage(img, tx * MAP_TILE_PX - originX, ty * MAP_TILE_PX - originY, MAP_TILE_PX, MAP_TILE_PX)
        } else if (!failed.has(url) && !inFlight.has(url)) {
          inFlight.add(url)
          const im = new Image()
          // Request tiles with CORS so the canvas isn't tainted and can be exported to PNG.
          // All three providers (Esri/OSM/OpenTopoMap) send Access-Control-Allow-Origin; a
          // provider that didn't would just fail to load and be marked failed, as before.
          im.crossOrigin = "anonymous"
          im.onload = () => {
            inFlight.delete(url)
            cache.set(url, im)
            // Bump to trigger a redraw that composites this tile in. Safe across style
            // changes/unmount: the redraw always uses the CURRENT mapStyle, and a late
            // tile for an old style just sits harmlessly in the cache.
            setTileVersion((v) => v + 1)
          }
          im.onerror = () => {
            inFlight.delete(url)
            failed.add(url)
          }
          im.src = url
        }
      }
    }
    paintRoute()
  }, [gpsData, currentTime, mapStyle, data, tileVersion, view])

  // Mouse-wheel zoom toward the cursor. A native non-passive listener lets us
  // preventDefault so the page doesn't scroll while zooming the map.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = projRef.current
      if (!p) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const cur = mercatorUnpx(p.originX + sx, p.originY + sy, p.z)
      const maxZ = mapStyle === "terrain" ? 17 : 18
      const nz = Math.max(2, Math.min(maxZ, p.z + (e.deltaY < 0 ? 1 : -1)))
      if (nz === p.z) return
      // Keep the geographic point under the cursor fixed on screen across the zoom.
      const cw = mercatorPx(cur.lat, cur.lng, nz)
      const c = mercatorUnpx(cw.x - sx + p.width / 2, cw.y - sy + p.height / 2, nz)
      setView({ zoom: nz, centerLat: c.lat, centerLng: c.lng })
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [mapStyle])

  // Tear down any in-progress drag listeners if the GPS tab unmounts mid-drag.
  useEffect(() => () => dragCleanupRef.current?.(), [])

  // Drag to pan, via Pointer Events so it works for mouse AND touch (single finger).
  // Computed from the drag-start origin each move so it stays smooth even as the
  // projection ref updates between renders. Two-finger pinch zoom isn't handled here —
  // the on-map +/- buttons cover zoom on touch — but the canvas has touch-action: none so
  // a one-finger pan doesn't also scroll the page.
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const p = projRef.current
    if (!p) return
    // Only start a pan for the primary pointer; ignore extra fingers (avoids fighting the
    // browser's own gesture handling on multi-touch).
    if (!e.isPrimary) return
    const start = { ox: p.originX, oy: p.originY, z: p.z, w: p.width, h: p.height, mx: e.clientX, my: e.clientY }
    const move = (ev: PointerEvent) => {
      const c = mercatorUnpx(
        start.ox - (ev.clientX - start.mx) + start.w / 2,
        start.oy - (ev.clientY - start.my) + start.h / 2,
        start.z,
      )
      setView({ zoom: start.z, centerLat: c.lat, centerLng: c.lng })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      dragCleanupRef.current = null
      setDragging(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    // Same teardown, callable from the unmount effect so a dropped pointerup / mid-drag tab
    // switch can't leak the listeners or keep calling setView on a dead component.
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      dragCleanupRef.current = null
    }
    setDragging(true)
  }

  // Keyboard pan/zoom so the map is operable without a mouse. Arrow keys pan by ~50px,
  // +/- (or =) zoom, and 0 resets to the auto-fit view.
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    const p = projRef.current
    if (!p) return
    const panBy = (dx: number, dy: number) => {
      const c = mercatorUnpx(p.originX + p.width / 2 + dx, p.originY + p.height / 2 + dy, p.z)
      setView({ zoom: p.z, centerLat: c.lat, centerLng: c.lng })
    }
    const STEP = 50
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); panBy(-STEP, 0); break
      case "ArrowRight": e.preventDefault(); panBy(STEP, 0); break
      case "ArrowUp": e.preventDefault(); panBy(0, -STEP); break
      case "ArrowDown": e.preventDefault(); panBy(0, STEP); break
      case "+": case "=": e.preventDefault(); zoomByButton(1); break
      case "-": case "_": e.preventDefault(); zoomByButton(-1); break
      case "0": e.preventDefault(); setView(null); break
    }
  }

  // Export the current map view (route + backdrop + markers) as a PNG download. Tiles are
  // loaded with crossOrigin so the canvas isn't tainted; if a browser still blocks the
  // export we surface a friendly note rather than throwing.
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          onNotify?.("Couldn't export the map image.")
          return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "gps-track.png"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, "image/png")
    } catch {
      onNotify?.("Couldn't export the map — try the Offline basemap.")
    }
  }

  // Zoom buttons keep the current centre and step the zoom by one level.
  const zoomByButton = (delta: number) => {
    const p = projRef.current
    if (!p) return
    const center = mercatorUnpx(p.originX + p.width / 2, p.originY + p.height / 2, p.z)
    const maxZ = mapStyle === "terrain" ? 17 : 18
    const nz = Math.max(2, Math.min(maxZ, p.z + delta))
    setView({ zoom: nz, centerLat: center.lat, centerLng: center.lng })
  }

  if (gpsData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Map className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No GPS data available</p>
          <p className="text-sm">Upload a file with latitude and longitude data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={onCanvasKeyDown}
        tabIndex={0}
        role="img"
        aria-label={
          trackDegenerate
            ? `GPS map: the vehicle was stationary (${gpsData.length} fixes within ~20 m).`
            : `GPS route map, ${gpsData.length} points. Focus it and use arrow keys to pan, plus or minus to zoom, and 0 to reset the view.`
        }
        className={`w-full h-full touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      />
      {trackDegenerate && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <div className="rounded-lg border border-border/70 bg-background/85 px-4 py-3 text-center shadow-lg shadow-black/30 backdrop-blur">
            <p className="text-sm font-medium text-foreground/90">No track to plot</p>
            <p className="mt-0.5 max-w-[17rem] text-xs text-muted-foreground">
              All GPS fixes are within ~20&nbsp;m — the vehicle was stationary, or the log has a single location.
            </p>
          </div>
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-lg border border-border/70 bg-background/85 p-1 shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex gap-1">
          {(["offline", "satellite", "street", "terrain"] as const).map((style) => (
            <Button
              key={style}
              size="sm"
              variant={mapStyle === style ? "default" : "ghost"}
              onClick={() => setMapStyle(style)}
              className="text-xs px-2 py-1"
            >
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <div className="absolute right-3 top-3 rounded-lg border border-border/70 bg-background/85 p-2.5 text-xs shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Start</span>
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-gray-800 rounded-full border border-white"></div>
          <span>Finish</span>
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>Current</span>
        </div>
        {/* Only show the speed-gradient legend when the track is actually colored by
            speed. With no usable speed variation the track is a neutral single color,
            so a "Slow → Fast" gradient legend would be misleading. */}
        {hasSpeedVariation ? (
          <>
            <div className="text-muted-foreground mt-2">Speed colored track</div>
            <div className="mt-1 flex items-center gap-1">
              <span className="tabular-nums">{Math.round(speedRange.min)}</span>
              <div className="h-2 w-8 rounded bg-gradient-to-r from-blue-500 to-red-500"></div>
              <span className="tabular-nums">{Math.round(speedRange.max)}</span>
              <span className="text-muted-foreground">km/h</span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground mt-2">GPS track</div>
        )}
      </div>
      {data[currentTime] && (
        <div className="absolute bottom-3 left-3 rounded-lg border border-border/70 bg-background/85 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur">
          <div className="font-mono text-base font-semibold tabular-nums text-primary">{data[currentTime].speed?.toFixed(1)} km/h</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current Speed</div>
        </div>
      )}
      {mapStyle !== "offline" && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/75 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
          {MAP_ATTRIBUTION[mapStyle]}
        </div>
      )}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => zoomByButton(1)}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => zoomByButton(-1)}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => setView(null)}
          aria-label="Fit track to view"
          title="Fit track to view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={exportPng}
          aria-label="Save map as PNG"
          title="Save map as PNG"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface TransmissionConfig {
  gearRatios: Record<number, number>
  finalDrive: number
  tyreDiameterMm: number
  shiftRpm: number
  numberOfGears: number
}

function calculateGear(
  speed: number,
  rpm: number,
  config: TransmissionConfig,
  speedUnit: "km/h" | "mph" = "km/h",
): number {
  if (!speed || !rpm || speed < 1 || rpm < 500) return 1

  // The theoretical-speed formula and the fallback thresholds below are all
  // expressed in km/h, but raw speed values are stored in their source unit
  // (no conversion at parse time). Normalize mph data to km/h up front so both
  // the diff comparison and the speed-range fallback use consistent units.
  const speedKmh = speedUnit === "mph" ? speed * 1.60934 : speed

  const tyreCircumference = (Math.PI * config.tyreDiameterMm) / 1000 // Convert to meters

  // Calculate theoretical speed (km/h) for each gear.
  // wheelRpm = rpm / (ratio * finalDrive); distance/min = wheelRpm * circumference_m;
  // *60 -> m/h, /1000 -> km/h. The previous formula multiplied by an extra *3600
  // (only correct for a mm-based circumference), inflating every speed by 3.6x and
  // pushing almost every real sample into the crude speed-range fallback.
  const gearSpeeds = Object.entries(config.gearRatios).map(([gear, ratio]) => {
    const theoreticalSpeed = ((rpm / (Number(ratio) * config.finalDrive)) * tyreCircumference * 60) / 1000
    return {
      gear: Number.parseInt(gear),
      speed: theoreticalSpeed,
      diff: Math.abs(theoreticalSpeed - speedKmh),
      ratio: Number(ratio),
    }
  })

  // Sort by closest match (smallest difference)
  gearSpeeds.sort((a, b) => a.diff - b.diff)

  // Find the gear with the closest theoretical speed to actual speed
  const bestMatch = gearSpeeds[0]

  // Add some hysteresis to prevent gear hunting
  const tolerance = speedKmh * 0.12 // 12% tolerance

  // If we're within tolerance, use the best match
  if (bestMatch.diff <= tolerance) {
    return Math.max(1, Math.min(bestMatch.gear, config.numberOfGears))
  }

  // Fallback to a simpler calculation based on km/h speed ranges.
  // The top bucket maps to the configured top gear (not a hard-coded 6) so
  // 7-speed transmissions can reach gear 7 in the fallback path too.
  if (speedKmh < 15) return 1
  else if (speedKmh < 35) return 2
  else if (speedKmh < 55) return 3
  else if (speedKmh < 80) return 4
  else if (speedKmh < 110) return 5
  else return config.numberOfGears
}

function getShiftIndicator(
  rpm: number,
  gear: number,
  config: TransmissionConfig,
): { shouldShift: "up" | "down" | "optimal" | null; reason: string } {
  if (!rpm || !gear) return { shouldShift: null, reason: "" }

  const shiftUpRpm = config.shiftRpm * 0.85 // Shift up at 85% of redline
  const shiftDownRpm = config.shiftRpm * 0.3 // Shift down below 30% of redline

  if (rpm > shiftUpRpm && gear < config.numberOfGears) {
    return { shouldShift: "up", reason: `Shift up at ${rpm} RPM` }
  }

  if (rpm < shiftDownRpm && gear > 1) {
    return { shouldShift: "down", reason: `Shift down at ${rpm} RPM` }
  }

  return { shouldShift: "optimal", reason: "Optimal gear" }
}

function detectGearRatios(data: DataPoint[], speedUnit: "km/h" | "mph" = "km/h"): any {
  if (data.length < 100) return null

  // Normalize speed to km/h up front. calculateGear already does this, but the bucketing
  // and gear-ratio math below assume km/h; on an mph log the same road speed is ~1.6x
  // smaller, inflating rpm/speed and pushing nearly every sample into a lower-gear bucket
  // — skewing the detected ratios, gear count and confidence, then writing bad values
  // into the config on "Apply".
  const toKmh = (s: number) => (speedUnit === "mph" ? s * 1.60934 : s)

  // Filter data with valid speed and RPM (thresholds are in km/h)
  const validData = data
    .map((d) => ({ ...d, speed: toKmh(d.speed) }))
    .filter((d) => d.speed > 5 && d.rpm > 1000 && d.speed < 200 && d.rpm < 8000)
  if (validData.length < 50) return null

  // Group data by estimated gear (rough calculation)
  const gearGroups: { [key: number]: Array<{ speed: number; rpm: number; ratio: number }> } = {}

  validData.forEach((point) => {
    // Estimate gear based on speed/RPM ratio (speed already normalized to km/h)
    const ratio = point.rpm / point.speed
    let estimatedGear = 1

    if (ratio < 30) estimatedGear = 6
    else if (ratio < 40) estimatedGear = 5
    else if (ratio < 55) estimatedGear = 4
    else if (ratio < 80) estimatedGear = 3
    else if (ratio < 120) estimatedGear = 2
    else estimatedGear = 1

    if (!gearGroups[estimatedGear]) gearGroups[estimatedGear] = []
    gearGroups[estimatedGear].push({ speed: point.speed, rpm: point.rpm, ratio })
  })

  // Calculate average ratios for each gear
  const detectedRatios: { [key: number]: number } = {}
  const gearStats: { [key: number]: { count: number; avgRatio: number; minSpeed: number; maxSpeed: number } } = {}

  Object.entries(gearGroups).forEach(([gear, points]) => {
    if (points.length < 5) return // Need at least 5 points per gear

    const avgRatio = points.reduce((sum, p) => sum + p.ratio, 0) / points.length
    const speeds = points.map((p) => p.speed)

    detectedRatios[Number(gear)] = avgRatio
    gearStats[Number(gear)] = {
      count: points.length,
      avgRatio,
      minSpeed: safeMin(speeds),
      maxSpeed: safeMax(speeds),
    }
  })

  // Estimate final drive and tire diameter
  const estimatedFinalDrive = 4.0 // Default assumption
  const estimatedTireDiameter = 650 // Default assumption

  // Convert RPM/speed ratios to gear ratios
  const tyrCircumference = (Math.PI * estimatedTireDiameter) / 1000
  const gearRatios: { [key: number]: number } = {}

  Object.entries(detectedRatios).forEach(([gear, rpmSpeedRatio]) => {
    // Formula: gear_ratio = (RPM * tyre_circumference * 60) / (speed * final_drive * 1000000) * 3600
    // Simplified: gear_ratio = (rpm_speed_ratio * tyre_circumference * 60 * 3600) / (final_drive * 1000000)
    // Inverse of the corrected calculateGear speed formula (km/h, circumference in
    // metres): ratio = (rpm/speed) * circ_m * 60 / (finalDrive * 1000). The old
    // *3600 / 1e6 form was ~3.6x off and no longer matched calculateGear.
    const gearRatio = (rpmSpeedRatio * tyrCircumference * 60) / (estimatedFinalDrive * 1000)
    gearRatios[Number(gear)] = gearRatio
  })

  // Detection can yield a non-contiguous set (e.g. only gears {3,4,6} on a highway log).
  // Fill any missing intermediate gears so gearRatios spans 1..maxGear contiguously,
  // which keeps numberOfGears (derived from maxGear, not the count) consistent with the
  // keys present and prevents the gear-ratio inputs / charts / calculateGear clamp from
  // dropping or mislabeling the real high-gear ratios.
  const detectedKeys = Object.keys(gearRatios).map(Number)
  const detectedCount = detectedKeys.length
  const maxGear = detectedCount > 0 ? Math.max(...detectedKeys) : 0
  for (let g = 1; g <= maxGear; g++) {
    if (gearRatios[g] === undefined) gearRatios[g] = 1.0
  }

  return {
    // Count of distinct gears actually detected — shown in the "Detected Gears" label.
    detectedGears: detectedCount,
    // Highest detected gear number — used to set numberOfGears so it matches the keys.
    maxGear,
    gearRatios,
    gearStats,
    estimatedFinalDrive,
    estimatedTireDiameter,
    // Confidence still reflects how many real gears were found, not the filled max.
    confidence: Math.min(detectedCount / 6, 1) * 100,
  }
}

function exportTransmissionConfig(config: TransmissionConfig): void {
  const dataStr = JSON.stringify(config, null, 2)
  const dataBlob = new Blob([dataStr], { type: "application/json" })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement("a")
  link.href = url
  link.download = "transmission-config.json"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Build a CSV of the processed/normalized data for the rows in [lo, hi] (inclusive),
// using each detected metric's original column name as the header plus a leading Time
// column. This exports the merged, unit-normalized data actually being analyzed — useful
// after merging multiple files or trimming to a section — not just the raw upload.
function buildWindowCsv(data: DataPoint[], metrics: MetricConfig[], lo: number, hi: number): string {
  const escape = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cols = metrics.filter((m) => typeof m.key === "string")
  const header = ["Time", ...cols.map((m) => m.originalName || m.label)]
  const lines = [header.map(escape).join(",")]
  const end = Math.min(hi, data.length - 1)
  for (let i = Math.max(0, lo); i <= end; i++) {
    const point = data[i]
    const row: (string | number)[] = [point?.timestamp ?? ""]
    for (const m of cols) {
      const v = (point as any)?.[m.key as string]
      row.push(typeof v === "number" && !isNaN(v) ? v : "")
    }
    lines.push(row.map(escape).join(","))
  }
  return lines.join("\n")
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function importTransmissionConfig(
  file: File,
  callback: (config: TransmissionConfig) => void,
  onError: (message: string) => void,
): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target?.result as string)
      if (config.gearRatios && config.finalDrive && config.tyreDiameterMm) {
        callback(config)
      } else {
        onError("That file isn't a valid transmission configuration.")
      }
    } catch (error) {
      onError("Couldn't read that transmission configuration file.")
    }
  }
  reader.onerror = () => onError("Couldn't read that transmission configuration file.")
  reader.readAsText(file)
}

function calculateTireDiameter(width: number, aspectRatio: number, rimSize: number): number {
  // Calculate sidewall height: (width * aspect ratio) / 100
  const sidewallHeight = (width * aspectRatio) / 100

  // Convert rim size from inches to mm
  const rimDiameterMm = rimSize * 25.4

  // Total diameter = rim diameter + (2 * sidewall height)
  const totalDiameter = rimDiameterMm + 2 * sidewallHeight

  return Math.round(totalDiameter)
}

function parseTireSize(tireSize: string): { width: number; aspectRatio: number; rimSize: number } | null {
  // Match patterns like "235/35R19", "235 35 R19", "235-35-19", etc.
  // Anchor the rim with \b so a typo like "235/35R199" is REJECTED rather than
  // silently truncated to rim 19 (which would feed a wrong diameter into the
  // transmission/speed calibration with no user feedback).
  const match = tireSize.match(/(\d{2,3})\s*[/\-\s]\s*(\d{2,3})\s*[rR]?\s*(\d{2})\b/)
  if (!match) return null

  const width = Number.parseInt(match[1])
  const aspectRatio = Number.parseInt(match[2])
  const rimSize = Number.parseInt(match[3])

  // Reject implausible values rather than feeding a wrong diameter into the calibration.
  if (width < 125 || width > 355) return null
  if (aspectRatio < 25 || aspectRatio > 85) return null
  if (rimSize < 12 || rimSize > 24) return null

  return { width, aspectRatio, rimSize }
}

// Helper function to normalize decimal separators and parse numbers.
// Previously this did a single, non-global `value.replace(",", ".")` which only
// swapped the FIRST comma. That corrupted thousands-grouped and European-format
// numbers (e.g. "1,234.5" -> "1.234.5" -> 1.234, and "12.345" EU-thousands ->
// 12.345 instead of 12345) — off by ~1000x with no error. This separator-aware
// normalizer strips grouping separators based on which separator appears last,
// so US ("1,234.5"), EU ("1.234,5") and plain ("12,5"/"12.5") all parse correctly.
function parseNumericValue(value: string): number {
  if (!value || typeof value !== "string") return 0

  // Strip stray backslashes first. Some exporters (e.g. datalog.help / OBDLink) escape
  // the decimal separator in GPS columns, writing latitude "01\.44" and longitude
  // "-61\.13". Without this, Number.parseFloat stops at the backslash and truncates the
  // value to its integer part (01\.44 -> 1, -61\.13 -> -61), collapsing every GPS fix
  // onto one coordinate so the track map degenerates to "No track to plot". No legitimate
  // numeric value contains a backslash, so removing them is safe for every column.
  let s = value.trim().replace(/\\/g, "")
  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  if (hasComma && hasDot) {
    // Both separators present: the right-most one is the decimal point, the other is grouping.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".") // EU: 1.234,5 -> 1234.5
    } else {
      s = s.replace(/,/g, "") // US: 1,234.5 -> 1234.5
    }
  } else if (hasComma) {
    const parts = s.split(",")
    // Only MULTIPLE commas are unambiguous grouping (1,234,567). A single comma is
    // an EU-style decimal separator (12,5 -> 12.5; 0,850 -> 0.85), so convert it
    // rather than stripping it.
    if (parts.length > 2) {
      s = s.replace(/,/g, "")
    } else {
      s = s.replace(",", ".")
    }
  } else if (hasDot) {
    const parts = s.split(".")
    // Only MULTIPLE dots are unambiguous grouping (1.234.567). A single dot is a
    // decimal point — including the very common 3-decimal sensor values like
    // 14.700 or 0.850, which must NOT be read as thousands (that was a 1000x bug).
    if (parts.length > 2) {
      s = s.replace(/\./g, "")
    }
  }

  const parsed = Number.parseFloat(s)
  return isNaN(parsed) ? 0 : parsed
}

// True only when a raw cell is genuinely numeric. parseNumericValue can't be used to
// decide this because it always coerces non-numeric input to 0 (never NaN), so a check
// like `!isNaN(parseNumericValue(v))` is always true and would classify text/enum
// columns ("OL"/"CL" fuel-system status, oxygen-sensor location, OBD cert strings) as
// numeric — polluting the PID list with flat-zero traces. This requires at least one
// digit and only digits, sign, separators or the exporter's stray backslash.
function isNumericCell(value: string): boolean {
  const s = value.replace(/\\/g, "").trim()
  if (!s) return false
  return /^[-+]?[\d.,]+$/.test(s) && /\d/.test(s)
}

// Helper function to detect speed unit from column names and data
function detectSpeedUnit(headers: string[], data: any[]): "km/h" | "mph" {
  // Check header names for unit indicators
  const speedHeaders = headers.filter((h) => h.toLowerCase().includes("speed") || h.toLowerCase().includes("velocity"))

  for (const header of speedHeaders) {
    const lower = header.toLowerCase()
    if (lower.includes("mph") || lower.includes("mi/h")) return "mph"
    if (lower.includes("kmh") || lower.includes("km/h") || lower.includes("kph")) return "km/h"
  }

  // Analyze speed data ranges to guess unit.
  // sampleData is keyed by RAW header strings (samplePoint[header]), not by the
  // normalized speed/vehicleSpeed/gpsSpeed keys (which are only assigned later in
  // the main parse loop). Reading those normalized keys here always produced an
  // empty array, making this heuristic dead code. Gather values from the actual
  // speed-named header columns present in the sample data instead.
  const speedValues = speedHeaders
    .flatMap((h) => data.map((d) => d[h]))
    .filter((v): v is number => typeof v === "number" && v > 0)

  if (speedValues.length > 0) {
    const maxSpeed = safeMax(speedValues)
    const avgSpeed = speedValues.reduce((sum, v) => sum + v, 0) / speedValues.length

    // If max speed is over 200 or average is over 80, likely km/h
    // If max speed is under 150 and average under 50, likely mph
    if (maxSpeed > 200 || avgSpeed > 80) return "km/h"
    if (maxSpeed < 150 && avgSpeed < 50) return "mph"
  }

  // Default to km/h
  return "km/h"
}

// Determine the order of multiple CSV files for merging
function determineFileOrder(files: File[]): File[] {
  if (files.length <= 1) return files

  // Try to extract sequence numbers from filenames
  const withSequence = files.map((file) => {
    const name = file.name.replace(/\.csv$/i, "")
    const match =
      name.match(/(\d+)\s*$/) ||
      name.match(/part\s*(\d+)/i) ||
      name.match(/\((\d+)\)/) ||
      name.match(/[_-](\d+)(?:[_-]|$)/)
    return { file, sequence: match ? parseInt(match[1], 10) : null }
  })

  // If all files have extractable sequence numbers, sort by them
  if (withSequence.every((f) => f.sequence !== null)) {
    return withSequence.sort((a, b) => a.sequence! - b.sequence!).map((f) => f.file)
  }

  // Fallback: sort by lastModified timestamp if they differ
  if (files.every((f) => f.lastModified > 0) && new Set(files.map((f) => f.lastModified)).size === files.length) {
    return [...files].sort((a, b) => a.lastModified - b.lastModified)
  }

  // Final fallback: natural alphabetical sort by name
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

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

// Helper function to format numbers with appropriate decimal places
function formatValue(value: number, unit = ""): string {
  if (isNaN(value) || value === null || value === undefined) return "N/A"

  // For very small values (less than 0.01), show more precision
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toFixed(4)
  }

  // For percentages and most values, 2 decimal places is enough
  if (unit === "%" || unit === "°C" || unit === "bar" || unit === "V") {
    return value.toFixed(2)
  }

  // For RPM and large numbers, no decimal places
  if (unit === "RPM" || Math.abs(value) > 1000) {
    return value.toFixed(0)
  }

  // Default to 2 decimal places
  return value.toFixed(2)
}

// Function to check for missing crucial PIDs
function checkMissingCrucialPIDs(
  data: DataPoint[],
  headers: string[],
): { missing: typeof CRUCIAL_PIDS; hasCriticalMissing: boolean } {
  const lowerHeaders = headers.map((h) => h.toLowerCase())
  const missing = []

  for (const pid of CRUCIAL_PIDS) {
    let found = false

    // Check if any of the PID keys exist in headers
    for (const key of pid.keys) {
      if (lowerHeaders.some((h) => h.includes(key.toLowerCase().replace("_", " ")) || h.includes(key.toLowerCase()))) {
        found = true
        break
      }
    }

    // Also check if data exists for this PID type
    if (!found && data.length > 0) {
      const sampleSize = Math.min(10, data.length)
      const sampleData = data.slice(0, sampleSize)

      for (const key of pid.keys) {
        const hasData = sampleData.some((point) => {
          const value = point[key as keyof DataPoint]
          return value !== undefined && value !== null && value !== 0 && !isNaN(Number(value))
        })

        if (hasData) {
          found = true
          break
        }
      }
    }

    if (!found) {
      missing.push(pid)
    }
  }

  // Consider it critical if RPM or Speed is missing
  const hasCriticalMissing = missing.some(
    (pid) =>
      pid.keys.includes("rpm") ||
      pid.keys.includes("speed") ||
      pid.keys.includes("engine_rpm") ||
      pid.keys.includes("vehicle_speed"),
  )

  return { missing, hasCriticalMissing }
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
  const sharedLoadedRef = useRef(false)
  const [showMissingPIDsDialog, setShowMissingPIDsDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000)
  }, [])
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
        const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"))

        // Guard against degenerate files. An empty, whitespace-only, or all-comment
        // file yields lines = [], so parseCsvLine(lines[0]) would call
        // parseCsvLine(undefined) and throw (swallowed by the catch below, leaving
        // stale data and zero user feedback). A header-only file (lines.length === 1)
        // parses to no data rows. Reset state and tell the user in both cases.
        if (lines.length === 0) {
          setMetrics([])
          setData([])
          setTimeRange([0, 0])
          setCurrentTime(0)
          setMissingPIDs({ missing: [], hasCriticalMissing: false })
          setRawCsv(null)
          showToast("The selected CSV file is empty or contains no data.")
          return
        }
        if (lines.length === 1) {
          setMetrics([])
          setData([])
          setTimeRange([0, 0])
          setCurrentTime(0)
          setMissingPIDs({ missing: [], hasCriticalMissing: false })
          setRawCsv(null)
          showToast("The CSV file has a header row but no data rows.")
          return
        }

        const headers = parseCsvLine(lines[0]).map((h) => h.trim())

        const shortenColumnName = (name: string): string => {
          const cleanName = name.replace(/[()]/g, "").replace(/\s+/g, " ").trim()
          const abbreviations: { [key: string]: string } = {
            Time: "Time",
            "Fuel system 1 status": "Fuel 1 Status",
            "Fuel system 2 status": "Fuel 2 Status",
            "Calculated load value": "Calculated Load",
            "Engine coolant temperature": "Coolant Temp",
            "Short term fuel % trim - Bank 1": "Short term fuel",
            "Short term fuel % trim - Bank 3": "Short term fuel",
            "Long term fuel % trim - Bank 1": "Long term fuel",
            "Long term fuel % trim - Bank 3": "Long term fuel",
            "Intake manifold absolute pressure": "MAP",
            "Engine RPM": "RPM",
            "Vehicle speed": "Speed",
            "Ignition timing advance for #1 cylinder": "Ignition Advance",
            "Intake air temperature": "Intake Temp",
            "Mass air flow rate": "MAF",
            "Absolute throttle position": "Throttle",
            "Absolute throttle position B": "Throttle B",
            "Location of oxygen sensors": "O2 Sens Location",
            "O2 voltage (Bank 1 Sensor 2)": "O2 Voltage",
            "O2 voltage Bank 1 Sensor 2": "O2 Voltage",
            "Short term fuel trim (Bank 1 Sensor 2)": "Short term fuel",
            "Short term fuel trim Bank 1 Sensor 2": "Short term fuel",
            "OBD requirements to which vehicle or engine is certified": "OBD Cert",
            "Time since engine start": "Engine Run Time",
            "Distance traveled while MIL is activated": "Distance with CEL",
            "Fuel rail pressure": "Fuel Pressure",
            "Commanded evaporative purge": "Evap Purge",
            "Number of warm-ups since DTCs cleared": "Warmups since DTCs cleared",
            "Distance traveled since DTCs cleared": "Distance since DTCs cleared",
            "Barometric pressure": "Barometric pressure",
            "O2 sensor lambda wide range": "O2 Lambda",
            "O2 sensor lambda wide range Bank 1 Sensor 1": "O2 Lambda",
            "O2 sensor current wide range (Bank 1 Sensor 1)": "O2 Sensor Current",
            "O2 sensor current wide range Bank 1 Sensor 1": "O2 Sensor Current",
            "Catalyst temperature (Bank 1 Sensor 1)": "Cat Temp",
            "Catalyst temperature Bank 1 Sensor 1": "Cat Temp",
            "Control module voltage": "Battery Voltage",
            "Fuel/Air commanded equivalence ratio": "Fuel/Air Ratio",
            "Accelerator pedal position D": "Pedal D",
            "Accelerator pedal position E": "Pedal E",
            "Commanded throttle actuator control": "Cmd Throttle Act",
            "Engine run time run while MIL is activated": "Run Time with CEL",
            "Engine run time while MIL is activated": "Run Time with CEL",
            "Engine run time since DTCs cleared": "Run Time since DTCs cleared",
            "Instant fuel economy": "Instant Fuel Economy",
            "Total fuel economy": "Total Fuel Economy",
            "Fuel rate": "Fuel Rate",
            "Instant CO2 rate": "Instant CO2",
            "Total CO2": "Total CO2",
            "CO2 flow": "CO2 Flow",
            "Trip Distance": "Trip Distance",
            "Trip Fuel Economy": "Trip Fuel Economy",
            "Trip Duration": "Trip Duration",
            "Trip Fuel": "Trip Fuel",
            "Hard Brake Count": "Hard Brakes",
            "Hard Accel Count": "Hard Accels",
            "Idling Count": "Idle Count",
            "Seconds Idling": "Time Idling",
            "Max Speed": "Max Speed",
            Boost: "Boost",
            "Engine Power": "Power",
            "Engine Torque": "Torque",
            "Fuel Remaining": "Fuel Left",
            "Distance to empty": "Range",
            Latitude: "Latitude",
            Longitude: "Longitude",
            Altitude: "Altitude",
            "GPS Speed": "GPS Speed",
            "Adapter voltage": "Adapter V",
            "Engine Oil Pressure": "Oil Press",
            "Air/Fuel Ratio": "AFR",
            "Ignition timing advance": "Ignition Adv",
            "Catalyst temperature": "Cat Temp",
            "Oil temperature": "Oil Temp",
            "Transmission temperature": "Trans Temp",
            "Exhaust gas temperature": "Exhaust Temp",
          }
          const nameWithoutUnits = cleanName.replace(/\s*\([^)]*\)\s*$/, "").trim()
          for (const [full, short] of Object.entries(abbreviations)) {
            if (nameWithoutUnits === full || cleanName.includes(full)) return short
          }
          const partialMatches: { [key: string]: string } = {
            "throttle position": "Throttle",
            "coolant temp": "Coolant",
            "intake temp": "IAT",
            "fuel trim": "Fuel Trim",
            "oxygen sensor": "O2 Sens",
            "catalyst temp": "Cat Temp",
            "fuel pressure": "Fuel Press",
            "manifold pressure": "MAP",
            "air flow": "MAF",
            "timing advance": "Timing",
            "pedal position": "Pedal",
            "engine power": "Power",
            "engine torque": "Torque",
            "fuel economy": "FE",
            "fuel rate": "Fuel Rate",
            "vehicle speed": "Speed",
            "engine rpm": "RPM",
            "oil pressure": "Oil Press",
            "oil temperature": "Oil Temp",
            "transmission temp": "Trans Temp",
            barometric: "Bar",
            evaporative: "Evap",
            equivalence: "Equiv",
            commanded: "Cmd",
            absolute: "Abs",
            temperature: "Temp",
            pressure: "Press",
            voltage: "Volt",
            current: "Curr",
            lambda: "Lambda",
            sensor: "Sens",
            distance: "Dist",
            duration: "Time",
            "air/fuel": "AFR",
            ignition: "Ignition",
          }
          const lowerName = nameWithoutUnits.toLowerCase()
          for (const [pattern, replacement] of Object.entries(partialMatches)) {
            if (lowerName.includes(pattern)) return replacement
          }
          const words = nameWithoutUnits.split(" ")
          if (words.length === 1) return words[0].length > 10 ? words[0].substring(0, 10) : words[0]
          if (words.length === 2) return `${words[0].substring(0, 5)} ${words[1].substring(0, 5)}`
          return words
            .map((w, i) => (i === 0 ? (w.length > 6 ? w.substring(0, 6) : w) : w.charAt(0).toUpperCase()))
            .join("")
            .substring(0, 10)
        }

        const extractUnit = (name: string): string => {
          // Pull a parenthesized unit from the header, e.g. "Vehicle speed (km/h)".
          // The previous literal /$$([^)]+)$$/ used `$$` (two end-of-string anchors,
          // a v0/MDX escape artifact) which could never match real parentheses, so
          // every parenthesized unit fell through to the keyword heuristics below.
          // Anchor to a trailing (unit) and trim to tolerate "Speed ( km/h )".
          const unitMatches = name.match(/\(([^)]+)\)\s*$/)
          if (unitMatches) return unitMatches[1].trim()
          const lower = name.toLowerCase()
          if (lower.includes("rpm")) return "RPM"
          if (lower.includes("speed") && lower.includes("km")) return "km/h"
          if (lower.includes("speed") && lower.includes("mph")) return "mph"
          if (lower.includes("temperature")) return "°C"
          if (lower.includes("pressure") && lower.includes("bar")) return "bar"
          if (lower.includes("pressure") && lower.includes("psi")) return "psi"
          if (lower.includes("voltage")) return "V"
          if (lower.includes("current")) return "mA"
          if (lower.includes("percentage") || lower.includes("position")) return "%"
          if (lower.includes("power")) return "hp"
          if (lower.includes("torque")) return "N•m"
          if (lower.includes("fuel") && lower.includes("rate")) return "l/hr"
          if (lower.includes("distance")) return "km"
          if (lower.includes("time") && !lower.includes("timing")) return "s"
          if (lower.includes("altitude")) return "m"
          if (lower.includes("latitude") || lower.includes("longitude")) return "deg"
          if (lower.includes("co2") && lower.includes("flow")) return "g/s"
          if (lower.includes("co2") && lower.includes("rate")) return "g/km"
          if (lower.includes("co2") && lower.includes("total")) return "kg"
          if (lower.includes("fuel") && lower.includes("economy")) return "l/100km"
          if (lower.includes("mass") && lower.includes("air")) return "g/s"
          if (lower.includes("air/fuel") || lower.includes("afr")) return "AFR"
          if (lower.includes("fuel/air") || lower.includes("afr")) return "AFR"
          if (lower.includes("ignition") && lower.includes("advance")) return "°"
          if (lower.includes("(hr)")) return "hr"
          if (lower.includes("(min)")) return "min"
          if (lower.includes("(sec)")) return "sec"
          if (lower.includes("(%)")) return "%"
          if (lower.includes("(l)")) return "l"
          if (lower.includes("(bar)")) return "bar"
          return ""
        }

        const generateColor = (index: number): string => {
          const colors = [
            "#ef4444",
            "#22c55e",
            "#eab308",
            "#f97316",
            "#06b6d4",
            "#8b5cf6",
            "#ec4899",
            "#84cc16",
            "#f59e0b",
            "#10b981",
            "#3b82f6",
            "#6366f1",
            "#d946ef",
            "#f43f5e",
            "#14b8a6",
          ]
          return colors[index % colors.length]
        }

        const detectedMetrics: MetricConfig[] = []
        const parsedData: DataPoint[] = []
        // Keyed by physical column INDEX (not header text) so duplicate or blank
        // header names each track their own numeric status instead of colliding
        // under a shared string key. This matches the col_${index} keyspace used
        // for metrics/data below.
        const numericColumns: { [key: number]: boolean } = {}

        // First pass: detect numeric columns across the FULL file so columns that
        // are blank in the first 9 rows but populate later (e.g. a sensor coming
        // online after warm-up, a GPS lock, or a sparse PID) are still retained.
        // sampleData is kept limited to the first ~10 rows purely for unit detection.
        const sampleData: any[] = []
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i])
          const buildSample = i < Math.min(lines.length, 10)
          const samplePoint: any = {}
          headers.forEach((header, index) => {
            if (header.toLowerCase() === "time") return
            const value = values[index]
            if (value && value.trim() !== "") {
              // Only flag the column numeric when the cell is actually numeric — see
              // isNumericCell. A column that is text in every row stays excluded instead
              // of becoming a zero-valued PID.
              if (isNumericCell(value)) {
                numericColumns[index] = true
                if (buildSample) samplePoint[header] = parseNumericValue(value)
              }
            }
          })
          if (buildSample && Object.keys(samplePoint).length > 0) {
            sampleData.push(samplePoint)
          }
        }

        // Detect speed unit from headers and sample data
        const detectedSpeedUnit = detectSpeedUnit(headers, sampleData)
        setSpeedUnit(detectedSpeedUnit)

        // Capture the Trip Duration column's unit so the readout can normalize to minutes
        // rather than assuming the raw value is already in minutes (some loggers emit
        // seconds, which would otherwise print e.g. a 30-minute trip as "30h 0min").
        const tripDurHeader = headers.find(
          (h) => h.toLowerCase().includes("trip") && h.toLowerCase().includes("duration"),
        )
        setTripDurationUnit(tripDurHeader ? extractUnit(tripDurHeader) || "min" : "min")

        let metricIndex = 0
        headers.forEach((header, colIdx) => {
          // Gate by column index (matches the index-keyed numericColumns above).
          if (header.toLowerCase() === "time" || !numericColumns[colIdx]) return
          const key = `col_${colIdx}`
          let unit = extractUnit(header)

          // Update speed unit based on detection
          if (header.toLowerCase().includes("speed") && !unit) {
            unit = detectedSpeedUnit
          }

          detectedMetrics.push({
            key: key,
            label: shortenColumnName(header),
            color: generateColor(metricIndex),
            unit: unit,
            enabled: false, // Start with all disabled, we'll enable non-empty ones later
            originalName: header,
          })
          metricIndex++
        })

        // Update speed metric unit based on detection
        const speedMetric = detectedMetrics.find(
          (m) => m.key === "speed" || m.originalName?.toLowerCase().includes("speed"),
        )
        if (speedMetric && !speedMetric.unit) {
          speedMetric.unit = detectedSpeedUnit
        }

        // `time` is the point's contiguous array index. Every consumer treats it as
        // a POSITIONAL index — the scrub/range sliders (max = data.length - 1),
        // currentTime, data[currentTime], the GPS live marker, and the PID
        // current-value lookup — so it must equal the position in `parsedData`.
        // The real clock value (when the log has a Time column) is kept only as the
        // human-readable `timestamp`; it is never used as the X coordinate, because
        // it may be a date string (e.g. "06/03/2025 02:22:17 PM") or non-uniformly
        // sampled, which would collapse/misalign every chart and the scrubber.
        const timeColIdx = headers.findIndex((h) => h.toLowerCase() === "time")
        let rowCounter = 0

        // Parse data with improved number parsing and unit conversion
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i])
          // Don't drop ragged rows that simply omit trailing fields (common when a
          // sensor times out or the last PID had no reading): missing trailing
          // columns are read as undefined and parseNumericValue maps them to 0.
          // Only skip rows that are genuinely empty.
          if (values.length === 1 && !values[0].trim()) continue
          const rawTime = timeColIdx >= 0 ? values[timeColIdx] : undefined
          const dataPoint: DataPoint = {
            time: rowCounter,
            timestamp: rawTime && rawTime.trim() ? rawTime : `${rowCounter}s`,
          } as DataPoint

          headers.forEach((header, colIdx) => {
            // Gate by column index (matches the index-keyed numericColumns above).
            if (!numericColumns[colIdx]) return
            const key = `col_${colIdx}`
            const rawValue = values[colIdx]
            const value = parseNumericValue(rawValue)
            dataPoint[key] = value

            const lowerHeader = header.toLowerCase()

            // Map to standard properties with unit conversion
            if (lowerHeader.includes("rpm")) {
              dataPoint.rpm = value
            }
            if (lowerHeader.includes("speed")) {
              // Map to standard speed properties
              if (lowerHeader.includes("max")) {
                // Store max speed separately, don't use it for real-time speed
                dataPoint.maxSpeed = value
              } else if (lowerHeader.includes("gps")) {
                dataPoint.gpsSpeed = value
                // Use GPS speed if no vehicle speed is set yet
                if (!dataPoint.speed) dataPoint.speed = value
              } else if (lowerHeader.includes("vehicle")) {
                // Vehicle speed is preferred for real-time speed
                dataPoint.speed = value
              } else if (!dataPoint.speed) {
                // Use any other speed field if no speed is set yet
                dataPoint.speed = value
              }
            }
            if (lowerHeader.includes("throttle")) dataPoint.throttle = value
            if (lowerHeader.includes("boost")) dataPoint.boost = value
            if (lowerHeader.includes("coolant")) dataPoint.coolantTemp = value
            if (lowerHeader.includes("power")) dataPoint.enginePower = value
            if (lowerHeader.includes("torque")) dataPoint.engineTorque = value
            if (lowerHeader.includes("latitude")) dataPoint.latitude = value
            if (lowerHeader.includes("longitude")) dataPoint.longitude = value
            if (lowerHeader.includes("fuel") && lowerHeader.includes("rate")) dataPoint.fuelRate = value
            if (lowerHeader.includes("intake") && lowerHeader.includes("temp")) dataPoint.intakeTemp = value
            if (lowerHeader.includes("air/fuel") || lowerHeader.includes("fuel/air") || lowerHeader.includes("afr"))
              dataPoint.afr = value
            if (lowerHeader.includes("ignition") && lowerHeader.includes("advance")) dataPoint.ignitionAdvance = value
            if (lowerHeader.includes("catalyst") && lowerHeader.includes("temp")) dataPoint.catTemp = value
            if (lowerHeader.includes("oil") && lowerHeader.includes("temp")) dataPoint.oilTemp = value
            if (lowerHeader.includes("transmission") && lowerHeader.includes("temp")) dataPoint.transTemp = value
            if (lowerHeader.includes("exhaust") && lowerHeader.includes("temp")) dataPoint.exhaustTemp = value
            if (lowerHeader.includes("trip") && lowerHeader.includes("duration")) dataPoint.tripDuration = value
            if (lowerHeader.includes("trip") && lowerHeader.includes("distance")) dataPoint.tripDistance = value
            if (lowerHeader.includes("trip") && lowerHeader.includes("fuel") && !lowerHeader.includes("economy"))
              dataPoint.tripFuel = value
            if (lowerHeader.includes("trip") && lowerHeader.includes("fuel") && lowerHeader.includes("economy"))
              dataPoint.tripFuelEconomy = value
          })

          // Use GPS speed as fallback if vehicle speed is not available
          if (!dataPoint.speed && dataPoint.gpsSpeed) {
            dataPoint.speed = dataPoint.gpsSpeed
          }

          if (!dataPoint.gear && dataPoint.speed && dataPoint.rpm) {
            // Pass the detected speed unit so mph logs are normalized inside calculateGear.
            dataPoint.gear = calculateGear(dataPoint.speed, dataPoint.rpm, transmissionConfig, detectedSpeedUnit)
          } else if (!dataPoint.gear && dataPoint.speed) {
            // Better fallback calculation based on speed ranges.
            // Normalize to km/h first (raw speed is stored in its source unit) so the
            // km/h cutoffs are correct for mph logs, and let the top bucket reach the
            // configured top gear (not a hard-coded 6) for 7-speed transmissions.
            const sKmh = detectedSpeedUnit === "mph" ? dataPoint.speed * 1.60934 : dataPoint.speed
            if (sKmh < 15) dataPoint.gear = 1
            else if (sKmh < 35) dataPoint.gear = 2
            else if (sKmh < 55) dataPoint.gear = 3
            else if (sKmh < 80) dataPoint.gear = 4
            else if (sKmh < 110) dataPoint.gear = 5
            else dataPoint.gear = transmissionConfig.numberOfGears
          }
          parsedData.push(dataPoint)
          // Increment only on a successful push so the fallback `time` counter stays
          // contiguous with the point's array position (no gaps from skipped rows).
          rowCounter++
        }

        // Now check which metrics have actual data and enable the first few non-empty ones.
        // A legitimately all-zero channel (e.g. boost on an NA engine, idle brake
        // pressure) is real data and should be eligible for auto-enable, so we no
        // longer treat 0 as "empty" — only null/undefined/NaN count as missing.
        const nonEmptyMetrics = detectedMetrics.filter((metric) => {
          const key = metric.key as string
          return parsedData.some((point) => {
            const value = (point as any)[key]
            return value !== null && value !== undefined && !isNaN(value)
          })
        })

        // Enable the first 6 non-empty metrics
        nonEmptyMetrics.slice(0, 6).forEach((metric) => {
          metric.enabled = true
        })

        // Check for missing crucial PIDs
        const pidCheck = checkMissingCrucialPIDs(parsedData, headers)
        setMissingPIDs(pidCheck)

        // Show warning dialog if crucial PIDs are missing
        if (pidCheck.missing.length > 0) {
          setShowMissingPIDsDialog(true)
        }

        setRawCsv(text)
        setMetrics(detectedMetrics)
        setData(parsedData)
        setTimeRange([0, Math.max(0, parsedData.length - 1)])
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

  // On first load, if the URL carries ?share=<id>, fetch that shared log and render it.
  useEffect(() => {
    if (!SHARING_ENABLED || sharedLoadedRef.current) return
    const shareId = new URLSearchParams(window.location.search).get("share")
    if (!shareId) return
    sharedLoadedRef.current = true
    ;(async () => {
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
    })()
    // One-shot on mount; parseCSV/showToast are stable enough for this loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const finalChartData = useMemo(() => {
    const processed = filteredData.map((point) => {
      const chartPoint: DataPoint = { ...point }
      metrics.forEach((metricConfig) => {
        const key = metricConfig.key as string
        const value = (point as any)[key]
        chartPoint[key] = typeof value === "number" && !isNaN(value) ? value : 0
      })
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

  const enabledMetrics = metrics.filter((m) => m.enabled)
  const currentDataPoint = data[currentTime] || null

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
            <TabsList className="flex w-full overflow-x-auto">
              <TabsTrigger value="overview" className="flex-1 min-w-[80px]">Overview</TabsTrigger>
              <TabsTrigger value="performance" className="flex-1 min-w-[80px]">Performance</TabsTrigger>
              <TabsTrigger value="engine" className="flex-1 min-w-[80px]">
                Engine
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex-1 min-w-[80px]">
                PID Analysis
              </TabsTrigger>
              <TabsTrigger value="gps" className="flex-1 min-w-[80px]">
                GPS Track
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4" style={{ height: `${STATIC_HEIGHT}px` }}>
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
                          scrollbarColor: "#2c3447 #11141d",
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
                  <Card className="p-5 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">General Overview</h2>
                      <BarChart3 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
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
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
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

            <TabsContent value="performance" className="space-y-0">
              <ErrorBoundary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ height: `${STATIC_HEIGHT}px` }}>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">RPM vs Speed Analysis</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="rpm" stroke="#ef4444" fontSize={12} orientation="left" label={{ value: "RPM", angle: -90, position: "insideLeft", fill: "#ef4444", fontSize: 11 }} />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Line yAxisId="rpm" dataKey="rpm" stroke="#ef4444" strokeWidth={2} dot={false} name="RPM" />
                        <Line
                          yAxisId="speed"
                          dataKey="speed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name={`Speed (${speedUnit})`}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="rpm" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Throttle vs Speed</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="throttle" stroke="#eab308" fontSize={12} orientation="left" label={{ value: "Throttle %", angle: -90, position: "insideLeft", fill: "#eab308", fontSize: 11 }} />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Line
                          yAxisId="throttle"
                          dataKey="throttle"
                          stroke="#eab308"
                          strokeWidth={2}
                          dot={false}
                          name="Throttle"
                        />
                        <Line
                          yAxisId="speed"
                          dataKey="speed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name={`Speed (${speedUnit})`}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="throttle" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Power & Torque</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="left" stroke="#ec4899" orientation="left" label={{ value: "Power (hp)", angle: -90, position: "insideLeft", fill: "#ec4899", fontSize: 11 }} />
                        <YAxis yAxisId="right" stroke="#84cc16" orientation="right" label={{ value: "Torque (N·m)", angle: 90, position: "insideRight", fill: "#84cc16", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          yAxisId="left"
                          dataKey="enginePower"
                          fill="#ec4899"
                          fillOpacity={0.3}
                          stroke="#ec4899"
                          name="Power (hp)"
                        />
                        <Line
                          yAxisId="right"
                          dataKey="engineTorque"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={false}
                          name="Torque (N•m)"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="left" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gearbox Usage</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis
                          yAxisId="gear"
                          stroke="#b666d2"
                          fontSize={12}
                          domain={[0.5, transmissionConfig.numberOfGears + 0.5]}
                          ticks={Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1)}
                          allowDataOverflow={true}
                          orientation="right"
                          label={{ value: "Gear", angle: 90, position: "insideRight", fill: "#b666d2", fontSize: 11 }}
                        />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="left" label={{ value: "Speed", angle: -90, position: "insideLeft", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={(value: any, name: any) => {
                            if (name === "gear") {
                              // Clamp to the configured gear count, not a hard-coded 6, so
                              // 7-speed (and higher) transmissions show their top gear.
                              const gear = Math.min(transmissionConfig.numberOfGears, Math.max(1, Number(value)))
                              return [`${gear}`, "Gear"]
                            }
                            return [`${value} ${speedUnit}`, "Speed"]
                          }}
                        />
                        <Line
                          yAxisId="gear"
                          dataKey={(data: any) => Math.min(transmissionConfig.numberOfGears, Math.max(1, data.gear || 1))}
                          stroke="#b666d2"
                          strokeWidth={2}
                          dot={false}
                          name="gear"
                          connectNulls
                        />
                        <Area
                          yAxisId="speed"
                          dataKey="speed"
                          fill="#22c55e"
                          fillOpacity={0.3}
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name="speed"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="gear" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gear Distribution</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={gearDistribution}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="gear" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={(value: any, name: any, props: any) => [
                            `${value} samples (${props.payload.percentage}%)`,
                            `Gear ${props.payload.gear}`,
                          ]}
                        />
                        <Bar dataKey="count" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="engine" className="space-y-0">
              <ErrorBoundary>
              <div className="grid grid-cols-2 gap-4" style={{ height: `${STATIC_HEIGHT}px` }}>
                <Card className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Engine Temperature</h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Sensors
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="">
                        {tempSensors.map((sensor) => (
                          <DropdownMenuItem
                            key={sensor.key}
                            onClick={() => {
                              setSelectedTempSensors((prev) =>
                                prev.includes(sensor.key)
                                  ? prev.filter((s) => s !== sensor.key)
                                  : [...prev, sensor.key],
                              )
                            }}
                            className={selectedTempSensors.includes(sensor.key) ? "bg-accent" : ""}
                          >
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: sensor.color }}></div>
                              <span>{sensor.label}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        {selectedTempSensors.map((sensorKey) => {
                          const sensor = tempSensors.find((s) => s.key === sensorKey)
                          if (!sensor) return null
                          return (
                            <Area
                              key={sensorKey}
                              dataKey={sensorKey}
                              fill={sensor.color}
                              fillOpacity={0.3}
                              stroke={sensor.color}
                              name={`${sensor.label} (°C)`}
                              strokeWidth={2}
                            />
                          )
                        })}
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ignition Advance</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={["dataMin - 5", "dataMax + 5"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Line
                          dataKey="ignitionAdvance"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          name="Ignition Advance (°)"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Boost Pressure</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={[(dataMin: number) => Math.min(dataMin - 0.2, -0.5), (dataMax: number) => Math.max(dataMax + 0.2, 0.5)]} tickFormatter={(v: number) => Number(v).toFixed(2)} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Line dataKey="boost" stroke="#06b6d4" strokeWidth={3} dot={false} name="Boost (bar)" />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fuel Consumption</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          dataKey="fuelRate"
                          fill="#f59e0b"
                          fillOpacity={0.3}
                          stroke="#f59e0b"
                          name="Fuel Rate (l/hr)"
                          strokeWidth={2}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Throttle & Brake</h2>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#11141d",
                            border: "1px solid #273043",
                            borderRadius: "10px",
                          }}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          dataKey="throttle"
                          fill="#22c55e"
                          fillOpacity={0.3}
                          stroke="#22c55e"
                          name="Throttle (%)"
                        />
                        <Area dataKey="brake" fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" name="Brake (%)" type="monotone" />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="analysis" className="space-y-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4" style={{ height: `${pidAnalysisHeight}px` }}>
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
                          scrollbarColor: "#2c3447 #11141d",
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
                                <div className="flex-grow">
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

            <TabsContent value="gps" className="space-y-0">
              <ErrorBoundary>
              <div style={{ height: `${STATIC_HEIGHT}px` }}>
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
                      const updatedData = data.map((point) => ({
                        ...point,
                        gear:
                          point.speed && point.rpm
                            ? calculateGear(point.speed, point.rpm, transmissionConfig, speedUnit)
                            : point.gear,
                      }))
                      setData(updatedData)
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
