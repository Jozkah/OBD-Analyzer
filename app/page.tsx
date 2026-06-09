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

function safeMax(arr: number[]): number {
  return arr.reduce((a, b) => (b > a ? b : a), -Infinity)
}
function safeMin(arr: number[]): number {
  return arr.reduce((a, b) => (b < a ? b : a), Infinity)
}

const tooltipFormatter = (value: number | string | undefined): string | number =>
  typeof value === "number" ? Number(value.toFixed(2)) : value ?? ""

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

// Enhanced GPS Track Map Component with proper map base
function GPSTrackMap({ data, currentTime }: { data: DataPoint[]; currentTime: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapStyle, setMapStyle] = useState<"satellite" | "street" | "terrain">("satellite")

  const gpsData = useMemo(
    () => data.filter((d) => d.latitude && d.longitude && d.latitude !== 0 && d.longitude !== 0),
    [data],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || gpsData.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const width = rect.width
    const height = rect.height

    const lats = gpsData.map((d) => d.latitude!)
    const lngs = gpsData.map((d) => d.longitude!)
    const minLat = safeMin(lats)
    const maxLat = safeMax(lats)
    const minLng = safeMin(lngs)
    const maxLng = safeMax(lngs)

    const padding = 40
    const latRange = maxLat - minLat || 0.001
    const lngRange = maxLng - minLng || 0.001

    ctx.clearRect(0, 0, width, height)

    if (mapStyle === "satellite") {
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "#1a1a2e")
      gradient.addColorStop(1, "#16213e")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    } else if (mapStyle === "street") {
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "#f0f0f0")
      gradient.addColorStop(1, "#d9d9d9")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    } else if (mapStyle === "terrain") {
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "#2d5016")
      gradient.addColorStop(1, "#1a2e05")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.fillStyle = "#111827"
      ctx.fillRect(0, 0, width, height)
    }

    ctx.strokeStyle = mapStyle === "street" ? "#cccccc" : "#374151"
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

    const toCanvas = (lat: number, lng: number) => ({
      x: padding + ((lng - minLng) / lngRange) * (width - 2 * padding),
      y: height - padding - ((lat - minLat) / latRange) * (height - 2 * padding),
    })

    const maxSpeed = Math.max(1, ...gpsData.map((d) => d.speed || 0))
    for (let i = 0; i < gpsData.length - 1; i++) {
      const point1 = gpsData[i]
      const point2 = gpsData[i + 1]
      const coords1 = toCanvas(point1.latitude!, point1.longitude!)
      const coords2 = toCanvas(point2.latitude!, point2.longitude!)
      const speedRatio = (point1.speed || 0) / maxSpeed
      const hue = (1 - speedRatio) * 240
      ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(coords1.x, coords1.y)
      ctx.lineTo(coords2.x, coords2.y)
      ctx.stroke()
    }

    const currentPoint = data[currentTime]
    if (currentPoint?.latitude && currentPoint?.longitude) {
      const coords = toCanvas(currentPoint.latitude, currentPoint.longitude)
      const pulseRadius = 8 + Math.sin(Date.now() * 0.01) * 3
      ctx.fillStyle = "#ef4444"
      ctx.beginPath()
      ctx.arc(coords.x, coords.y, pulseRadius, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(coords.x, coords.y, pulseRadius + 2, 0, 2 * Math.PI)
      ctx.stroke()
    }

    if (gpsData.length > 0) {
      const startCoords = toCanvas(gpsData[0].latitude!, gpsData[0].longitude!)
      const endCoords = toCanvas(gpsData[gpsData.length - 1].latitude!, gpsData[gpsData.length - 1].longitude!)
      ctx.fillStyle = "#22c55e"
      ctx.beginPath()
      ctx.arc(startCoords.x, startCoords.y, 8, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 12px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("S", startCoords.x, startCoords.y)
      ctx.fillStyle = "#1f2937"
      ctx.beginPath()
      ctx.arc(endCoords.x, endCoords.y, 8, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText("F", endCoords.x, endCoords.y)
    }

    ctx.fillStyle = mapStyle === "street" ? "#333333" : "#ffffff"
    ctx.font = "10px Arial"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`${minLat.toFixed(4)}, ${minLng.toFixed(4)}`, 5, height - 5)
    ctx.fillText(`${maxLat.toFixed(4)}, ${maxLng.toFixed(4)}`, 5, 15)
  }, [gpsData, currentTime, mapStyle, data])

  if (gpsData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
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
      <canvas ref={canvasRef} className="w-full h-full rounded" />
      <div className="absolute top-2 left-2 bg-gray-800/90 rounded p-2">
        <div className="flex gap-1">
          {(["satellite", "street", "terrain"] as const).map((style) => (
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
      <div className="absolute top-2 right-2 bg-gray-800/90 rounded p-2 text-xs">
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
        <div className="text-gray-400 mt-2">Speed colored track</div>
        <div className="flex items-center space-x-1 mt-1">
          <div className="w-4 h-2 bg-gradient-to-r from-blue-500 to-red-500 rounded"></div>
          <span>Slow → Fast</span>
        </div>
      </div>
      {data[currentTime] && (
        <div className="absolute bottom-2 left-2 bg-gray-800/90 rounded p-2 text-sm">
          <div className="text-white font-bold">{data[currentTime].speed?.toFixed(1)} km/h</div>
          <div className="text-gray-400 text-xs">Current Speed</div>
        </div>
      )}
    </div>
  )
}

function calculateGear(speed: number, rpm: number, config: any): number {
  if (!speed || !rpm || speed < 1 || rpm < 500) return 1

  const tyreCircumference = (Math.PI * config.tyreDiameterMm) / 1000 // Convert to meters

  // Calculate theoretical speed for each gear
  const gearSpeeds = Object.entries(config.gearRatios).map(([gear, ratio]) => {
    const theoreticalSpeed = ((rpm * tyreCircumference * 60) / (Number(ratio) * config.finalDrive * 1000000)) * 3600
    return {
      gear: Number.parseInt(gear),
      speed: theoreticalSpeed,
      diff: Math.abs(theoreticalSpeed - speed),
      ratio: Number(ratio),
    }
  })

  // Sort by closest match (smallest difference)
  gearSpeeds.sort((a, b) => a.diff - b.diff)

  // Find the gear with the closest theoretical speed to actual speed
  const bestMatch = gearSpeeds[0]

  // Add some hysteresis to prevent gear hunting
  const tolerance = speed * 0.12 // 12% tolerance

  // If we're within tolerance, use the best match
  if (bestMatch.diff <= tolerance) {
    return Math.max(1, Math.min(bestMatch.gear, config.numberOfGears))
  }

  // Fallback to a simpler calculation based on speed ranges
  if (speed < 15) return 1
  else if (speed < 35) return 2
  else if (speed < 55) return 3
  else if (speed < 80) return 4
  else if (speed < 110) return 5
  else return Math.min(6, config.numberOfGears)
}

function getShiftIndicator(
  rpm: number,
  gear: number,
  config: any,
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

function detectGearRatios(data: DataPoint[]): any {
  if (data.length < 100) return null

  // Filter data with valid speed and RPM
  const validData = data.filter((d) => d.speed > 5 && d.rpm > 1000 && d.speed < 200 && d.rpm < 8000)
  if (validData.length < 50) return null

  // Group data by estimated gear (rough calculation)
  const gearGroups: { [key: number]: Array<{ speed: number; rpm: number; ratio: number }> } = {}

  validData.forEach((point) => {
    // Estimate gear based on speed/RPM ratio
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
    const gearRatio = (rpmSpeedRatio * tyrCircumference * 60 * 3600) / (estimatedFinalDrive * 1000000)
    gearRatios[Number(gear)] = gearRatio
  })

  return {
    detectedGears: Object.keys(gearRatios).length,
    gearRatios,
    gearStats,
    estimatedFinalDrive,
    estimatedTireDiameter,
    confidence: Math.min(Object.keys(gearRatios).length / 6, 1) * 100,
  }
}

function exportTransmissionConfig(config: any): void {
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

function importTransmissionConfig(file: File, callback: (config: any) => void): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target?.result as string)
      if (config.gearRatios && config.finalDrive && config.tyreDiameterMm) {
        callback(config)
      } else {
        alert("Invalid transmission configuration file")
      }
    } catch (error) {
      alert("Error reading transmission configuration file")
    }
  }
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
  const match = tireSize.match(/(\d{3})\s*[/\-\s]\s*(\d{2})\s*[rR]?\s*(\d{2})/)

  if (match) {
    return {
      width: Number.parseInt(match[1]),
      aspectRatio: Number.parseInt(match[2]),
      rimSize: Number.parseInt(match[3]),
    }
  }

  return null
}

// Helper function to normalize decimal separators and parse numbers
function parseNumericValue(value: string): number {
  if (!value || typeof value !== "string") return 0

  // Replace comma decimal separator with period
  const normalizedValue = value.replace(",", ".")
  const parsed = Number.parseFloat(normalizedValue)

  return isNaN(parsed) ? 0 : parsed
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

  // Analyze speed data ranges to guess unit
  const speedValues = data.map((d) => d.speed || d.vehicleSpeed || d.gpsSpeed).filter((v) => v && v > 0)

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

  // First file: keep everything (comments + header + data)
  let merged = texts[0].trimEnd()

  // Subsequent files: skip comment lines and header row, keep only data
  for (let i = 1; i < texts.length; i++) {
    const lines = texts[i].split("\n")
    let dataStartIndex = 0
    for (let j = 0; j < lines.length; j++) {
      const trimmed = lines[j].trim()
      if (!trimmed) continue
      if (trimmed.startsWith("#")) continue
      // This is the header line — skip it, data starts after
      dataStartIndex = j + 1
      break
    }
    const dataLines = lines.slice(dataStartIndex).filter((l) => l.trim())
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
  const [transmissionConfig, setTransmissionConfig] = useState<{
    gearRatios: Record<number, number>
    finalDrive: number
    tyreDiameterMm: number
    shiftRpm: number
    numberOfGears: number
  }>({
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
  const [transmissionPresets] = useState<{ name: string; config: { gearRatios: Record<number, number>; finalDrive: number; tyreDiameterMm: number; shiftRpm: number; numberOfGears: number } }[]>([
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
        if (prev >= data.length - 1) {
          setIsPlaying(false)
          return 0
        }
        return prev + 1
      })
    }, 100)
    return () => clearInterval(interval)
  }, [isPlaying, data.length])

  // Check if a metric has all zero values or is empty
  const isEmptyPID = useCallback(
    (metric: MetricConfig) => {
      const key = metric.key as string
      return data.every((point) => {
        const value = (point as any)[key]
        return value === 0 || value === null || value === undefined || isNaN(value)
      })
    },
    [data],
  )

  const parseCSV = useCallback(
    async (file: File) => {
      setIsLoading(true)
      try {
        const text = await file.text()
        const lines = text.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"))
        const headers = lines[0].split(",").map((h) => h.trim())

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
          const unitMatches = name.match(/$$([^)]+)$$/)
          if (unitMatches) return unitMatches[1]
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
        const numericColumns: { [key: string]: boolean } = {}

        // First pass: detect numeric columns and sample data for unit detection
        const sampleData: any[] = []
        for (let i = 1; i < Math.min(lines.length, 10); i++) {
          const values = lines[i].split(",")
          const samplePoint: any = {}
          headers.forEach((header, index) => {
            if (header.toLowerCase() === "time") return
            const value = values[index]
            if (value && value.trim() !== "") {
              const numericValue = parseNumericValue(value)
              if (!isNaN(numericValue)) {
                numericColumns[header] = true
                samplePoint[header] = numericValue
              }
            }
          })
          if (Object.keys(samplePoint).length > 0) {
            sampleData.push(samplePoint)
          }
        }

        // Detect speed unit from headers and sample data
        const detectedSpeedUnit = detectSpeedUnit(headers, sampleData)
        setSpeedUnit(detectedSpeedUnit)

        let metricIndex = 0
        headers.forEach((header, colIdx) => {
          if (header.toLowerCase() === "time" || !numericColumns[header]) return
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

        // Parse data with improved number parsing and unit conversion
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",")
          if (values.length < headers.length) continue
          const dataPoint: DataPoint = { time: i - 1, timestamp: values[0] || `${i - 1}s` } as DataPoint

          headers.forEach((header, colIdx) => {
            if (!numericColumns[header]) return
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
            dataPoint.gear = calculateGear(dataPoint.speed, dataPoint.rpm, transmissionConfig)
          } else if (!dataPoint.gear && dataPoint.speed) {
            // Better fallback calculation based on speed ranges
            if (dataPoint.speed < 15) dataPoint.gear = 1
            else if (dataPoint.speed < 35) dataPoint.gear = 2
            else if (dataPoint.speed < 55) dataPoint.gear = 3
            else if (dataPoint.speed < 80) dataPoint.gear = 4
            else if (dataPoint.speed < 110) dataPoint.gear = 5
            else dataPoint.gear = Math.min(6, transmissionConfig.numberOfGears)
          }
          parsedData.push(dataPoint)
        }

        // Now check which metrics have actual data and enable the first few non-empty ones
        const nonEmptyMetrics = detectedMetrics.filter((metric) => {
          const key = metric.key as string
          return !parsedData.every((point) => {
            const value = (point as any)[key]
            return value === 0 || value === null || value === undefined || isNaN(value)
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

        setMetrics(detectedMetrics)
        setData(parsedData)
        setTimeRange([0, Math.max(0, parsedData.length - 1)])
        setCurrentTime(0)
      } catch (error) {
        console.error("Error parsing CSV:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [transmissionConfig],
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
        const merged = await mergeCSVFiles(ordered)
        setSelectedFile(merged)
        parseCSV(merged)
      }
    },
    [parseCSV],
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
        const merged = await mergeCSVFiles(ordered)
        setSelectedFile(merged)
        parseCSV(merged)
      }
    },
    [parseCSV],
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
      const step = Math.ceil(processed.length / 500)
      return processed.filter((_, index) => index % step === 0)
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
        zones.push({ x1: zoneStart, x2: finalChartData[i - 1].time })
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
    const validCoolants = statsData.map((d) => d.coolantTemp || 0).filter((v) => v > 0)
    const validIntakes = statsData.map((d) => d.intakeTemp || 0).filter((v) => v > 0)
    const validSpeeds = statsData.map((d) => d.speed || d.gpsSpeed || 0).filter((v) => v > 0)

    // For max speed, try multiple sources in order of preference
    let maxSpeed = 0

    // First, try to find a dedicated "Max Speed" field
    const maxSpeedFromField = statsData.map((d) => d.maxSpeed || 0).filter((v) => v > 0)

    if (maxSpeedFromField.length > 0) {
      maxSpeed = safeMax(maxSpeedFromField)
    } else {
      // Fallback to calculating from speed data
      if (validSpeeds.length > 0) {
        maxSpeed = safeMax(validSpeeds)
      }
    }

    return {
      maxRPM: validRPMs.length > 0 ? safeMax(validRPMs) : 0,
      maxSpeed: maxSpeed,
      maxBoost: validBoosts.length > 0 ? safeMax(validBoosts) : 0,
      avgCoolant: validCoolants.length > 0 ? validCoolants.reduce((sum, v) => sum + v, 0) / validCoolants.length : 0,
      avgIntakeTemp: validIntakes.length > 0 ? validIntakes.reduce((sum, v) => sum + v, 0) / validIntakes.length : 0,
      maxPower: validPowers.length > 0 ? safeMax(validPowers) : 0,
      maxTorque: validTorques.length > 0 ? safeMax(validTorques) : 0,
      avgSpeed: validSpeeds.length > 0 ? validSpeeds.reduce((sum, v) => sum + v, 0) / validSpeeds.length : 0,
      avgRPM: validRPMs.length > 0 ? validRPMs.reduce((sum, v) => sum + v, 0) / validRPMs.length : 0,
    }
  }, [data, ignoreIdle])

  const autoDetection = useMemo(() => {
    if (data.length > 100) {
      return detectGearRatios(data)
    }
    return null
  }, [data])

  const addPID = useCallback(
    (pidKey: string) => {
      if (!selectedPIDs.includes(pidKey)) setSelectedPIDs((prev) => [...prev, pidKey])
    },
    [selectedPIDs],
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
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-2">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <h1 className="text-2xl font-bold">OBD Data Analyzer</h1>
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="bg-gray-800 border-gray-600 hover:bg-gray-700"
            >
              <Upload className="w-4 h-4 mr-2" /> Load CSV
            </Button>
            <Button
              onClick={loadSampleData}
              variant="outline"
              className="bg-gray-800 border-gray-600 hover:bg-gray-700"
            >
              <FileText className="w-4 h-4 mr-2" /> Load Sample
            </Button>
          </div>
          {selectedFile && (
            <div className="text-sm text-gray-400 w-full md:w-auto mt-2 md:mt-0">
              <span>
                {importedFileNames.length > 1
                  ? `${importedFileNames.length} files merged`
                  : selectedFile.name}{" "}
                ({data.length} records) - {speedUnit}
              </span>
              {importedFileNames.length > 1 && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {importedFileNames.join(" → ")}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0 w-full md:w-auto justify-end">
          <Link href="/changelogs">
            <Button variant="outline" size="sm" className="bg-gray-800 border-gray-600 hover:bg-gray-700">
              <History className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Changelogs</span>
            </Button>
          </Link>
          <Button
            onClick={() => setShowTransmissionDialog(true)}
            variant="outline"
            size="sm"
            className={`bg-gray-800 border-gray-600 hover:bg-gray-700 ${data.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={data.length === 0}
          >
            <Settings className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Transmission</span>
          </Button>
          <Button
            onClick={() => setIsPlaying(!isPlaying)}
            variant="outline"
            size="sm"
            className="bg-gray-800 border-gray-600 hover:bg-gray-700"
            disabled={data.length === 0}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            onClick={() => setCurrentTime(0)}
            variant="outline"
            size="sm"
            className="bg-gray-800 border-gray-600 hover:bg-gray-700"
            disabled={data.length === 0}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Missing PIDs Warning Dialog */}
      <AlertDialog open={showMissingPIDsDialog} onOpenChange={setShowMissingPIDsDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              Missing Crucial Data Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Your datalog appears to be missing some important PIDs that are essential for the full functionality of
              this analyzer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="font-semibold text-white mb-3">Missing PIDs:</h4>
              <div className="space-y-3">
                {missingPIDs.missing.map((pid, index) => (
                  <div key={index} className="border-l-4 border-yellow-400 pl-4">
                    <div className="font-medium text-yellow-400">{pid.name}</div>
                    <div className="text-sm text-gray-300 mt-1">{pid.description}</div>
                    <div className="text-xs text-gray-400 mt-1">Affects: {pid.tabs.join(", ")} tabs</div>
                    <div className="text-xs text-gray-500 mt-1">Looking for: {pid.keys.join(", ")}</div>
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

            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
              <h4 className="font-semibold text-blue-400 mb-2">Recommendations:</h4>
              <ul className="text-sm text-blue-300 space-y-1">
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
              className="bg-blue-600 hover:bg-blue-700"
            >
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading && (
        <div className="text-center py-8">
          <div className="text-lg">Loading and parsing data...</div>
        </div>
      )}
      {data.length > 0 && (
        <>
          <Card className="bg-gray-800 border-gray-700 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Current Time: {currentTime} / {data.length - 1} ({((currentTime / data.length) * 100).toFixed(1)}%)
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
                <label className="text-sm font-medium mb-2 block">
                  Time Range: {timeRange[0]} - {timeRange[1]} ({timeRange[1] - timeRange[0] + 1} points,{" "}
                  {(((timeRange[1] - timeRange[0] + 1) / data.length) * 100).toFixed(1)}%)
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
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
              <Checkbox
                checked={ignoreIdle}
                onCheckedChange={(checked: boolean) => setIgnoreIdle(checked === true)}
              />
              <span className="text-sm font-medium">Ignore Idle</span>
              <span className="text-xs text-gray-400">(Excludes speed = 0 from statistics and averages)</span>
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex w-full overflow-x-auto bg-gray-800">
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
                  <Card className="bg-gray-800 border-gray-700 h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h3 className="font-semibold mb-3">Available PIDs ({metrics.length})</h3>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            placeholder="Search PIDs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 h-8"
                          />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 bg-gray-700 border-gray-600">
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Sort
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-gray-800 border-gray-600 text-white">
                            <DropdownMenuItem
                              onClick={() => setSortOption("default")}
                              className={sortOption === "default" ? "bg-gray-700" : ""}
                            >
                              Default Order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortOption("alphabetical")}
                              className={sortOption === "alphabetical" ? "bg-gray-700" : ""}
                            >
                              Alphabetical
                            </DropdownMenuItem>
                            <div className="px-2 py-1.5">
                              <div className="flex items-center space-x-2">
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={(checked) => setShowEmptyPIDs(checked === true)} />
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
                          scrollbarColor: "#4b5563 #1f2937",
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
                                />
                                <div
                                  className="w-3 h-3 rounded flex-shrink-0"
                                  style={{ backgroundColor: metric.color }}
                                />
                                <span className="text-sm truncate">{metric.label}</span>
                                {metric.unit && (
                                  <span className="text-xs text-gray-400 flex-shrink-0">({metric.unit})</span>
                                )}
                                {isEmpty && <span className="text-xs text-gray-500 flex-shrink-0">∅</span>}
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-center text-gray-400 py-4">No metrics found</div>
                        )}
                      </div>
                    </div>
                    {currentDataPoint && (
                      <div className="mt-auto p-4 pt-3 border-t border-gray-600 flex-shrink-0">
                        <h4 className="font-medium mb-2">Current Values</h4>
                        <div className="space-y-1 text-sm">
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
                                  ? calculateGear(currentDataPoint.speed, currentDataPoint.rpm, transmissionConfig)
                                  : "N/A"}
                              </span>
                              {currentDataPoint &&
                                (() => {
                                  const gear = calculateGear(
                                    currentDataPoint.speed,
                                    currentDataPoint.rpm,
                                    transmissionConfig,
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
                                  return <span className="text-gray-400">•</span>
                                })()}
                            </div>
                          </div>
                          {currentDataPoint &&
                            (() => {
                              const gear = calculateGear(
                                currentDataPoint.speed,
                                currentDataPoint.rpm,
                                transmissionConfig,
                              )
                              const shiftIndicator = getShiftIndicator(currentDataPoint.rpm, gear, transmissionConfig)
                              if (shiftIndicator.shouldShift !== "optimal" && shiftIndicator.shouldShift !== null) {
                                return <div className="text-xs text-gray-400 mt-1">{shiftIndicator.reason}</div>
                              }
                              return null
                            })()}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
                <div className="col-span-1 md:col-span-7">
                  <Card className="bg-gray-800 border-gray-700 p-4 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">General Overview</h3>
                      <Button variant="ghost" size="sm">
                        <BarChart3 className="w-4 h-4" />
                      </Button>
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                  <Card className="bg-gray-800 border-gray-700 p-4 h-full">
                    <h3 className="font-semibold mb-4">Session Statistics</h3>
                    <div className="space-y-3 text-sm">
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
                      <div className="h-px bg-gray-700 my-2"></div>
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
                      <div className="h-px bg-gray-700 my-2"></div>
                      <div className="flex justify-between">
                        <span>Average Coolant Temp:</span>
                        <span className="text-purple-400 font-bold">{formatValue(stats.avgCoolant, "°C")}°C</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Average Intake Temp:</span>
                        <span className="text-orange-400 font-bold">{formatValue(stats.avgIntakeTemp, "°C")}°C</span>
                      </div>
                      <div className="h-px bg-gray-700 my-2"></div>
                      <div className="flex justify-between">
                        <span>Trip Duration:</span>
                        <span className="text-gray-300">
                          {data.length > 0 && data[data.length - 1]?.tripDuration
                            ? (data[data.length - 1].tripDuration ?? 0) >= 60
                              ? `${Math.floor((data[data.length - 1].tripDuration ?? 0) / 60)}h ${Math.floor((data[data.length - 1].tripDuration ?? 0) % 60)}min`
                              : `${Math.floor(data[data.length - 1].tripDuration ?? 0)}min`
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Distance:</span>
                        <span className="text-gray-300">
                          {data.length > 0 && data[data.length - 1]?.tripDistance
                            ? `${formatValue(data[data.length - 1].tripDistance ?? 0)} km`
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Fuel Used:</span>
                        <span className="text-gray-300">
                          {data.length > 0 && data[data.length - 1]?.tripFuel
                            ? `${formatValue(data[data.length - 1].tripFuel ?? 0)} L`
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trip Fuel Economy:</span>
                        <span className="text-gray-300">
                          {data.length > 0 && data[data.length - 1]?.tripFuelEconomy
                            ? `${formatValue(data[data.length - 1].tripFuelEconomy ?? 0)} L/100km`
                            : "N/A"}
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">RPM vs Speed Analysis</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis yAxisId="rpm" stroke="#ef4444" fontSize={12} orientation="left" />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Throttle vs Speed</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis yAxisId="throttle" stroke="#eab308" fontSize={12} orientation="left" />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Power & Torque</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis yAxisId="left" stroke="#ec4899" orientation="left" />
                        <YAxis yAxisId="right" stroke="#84cc16" orientation="right" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Gearbox Usage</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis
                          yAxisId="gear"
                          stroke="#b666d2"
                          fontSize={12}
                          domain={[0.5, 6.5]}
                          ticks={[1, 2, 3, 4, 5, 6]}
                          allowDataOverflow={true}
                          orientation="right"
                        />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="left" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
                          }}
                          formatter={(value: any, name: any) => {
                            if (name === "gear") {
                              const gear = Math.min(6, Math.max(1, Number(value)))
                              return [`${gear}`, "Gear"]
                            }
                            return [`${value} ${speedUnit}`, "Speed"]
                          }}
                        />
                        <Line
                          yAxisId="gear"
                          dataKey={(data: any) => Math.min(6, Math.max(1, data.gear || 1))}
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Gear Distribution</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={
                          finalChartData.length > 0
                            ? Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1).map((g) => {
                                const count = finalChartData.filter((d) => d.gear === g).length
                                return {
                                  gear: g,
                                  count: count,
                                  percentage: count > 0 ? ((count / finalChartData.length) * 100).toFixed(1) : "0.0",
                                }
                              })
                            : []
                        }
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="gear" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h3 className="font-semibold">Engine Temperature</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 bg-gray-700 border-gray-600">
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Sensors
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-800 border-gray-600 text-white">
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
                            className={selectedTempSensors.includes(sensor.key) ? "bg-gray-700" : ""}
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Ignition Advance</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} domain={["dataMin - 5", "dataMax + 5"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Boost Pressure</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} domain={[(dataMin: number) => Math.min(dataMin - 0.2, -0.5), (dataMax: number) => Math.max(dataMax + 0.2, 0.5)]} tickFormatter={(v: number) => Number(v).toFixed(2)} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Fuel Consumption</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Throttle & Brake</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
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
                  <Card className="bg-gray-800 border-gray-700 h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h3 className="font-semibold mb-3">Available PIDs ({metrics.length})</h3>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            placeholder="Search PIDs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 h-8"
                          />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 bg-gray-700 border-gray-600">
                              <ChevronDown className="h-4 w-4 mr-1" />
                              Sort
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-gray-800 border-gray-600 text-white">
                            <DropdownMenuItem
                              onClick={() => setSortOption("default")}
                              className={sortOption === "default" ? "bg-gray-700" : ""}
                            >
                              Default Order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSortOption("alphabetical")}
                              className={sortOption === "alphabetical" ? "bg-gray-700" : ""}
                            >
                              Alphabetical
                            </DropdownMenuItem>
                            <div className="px-2 py-1.5">
                              <div className="flex items-center space-x-2">
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={(checked) => setShowEmptyPIDs(checked === true)} />
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
                          scrollbarColor: "#4b5563 #1f2937",
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
                                  <span className="text-xs text-gray-400 flex-shrink-0">({metric.unit})</span>
                                )}
                                {isEmpty && <span className="text-xs text-gray-500 flex-shrink-0">∅</span>}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => addPID(metric.key as string)}
                                  disabled={selectedPIDs.includes(metric.key as string)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-center text-gray-400 py-4">No PIDs found</div>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto p-4 pt-3 border-t border-gray-600 flex-shrink-0">
                      <h4 className="font-medium mb-3">Selected PIDs ({selectedPIDs.length})</h4>
                      {selectedPIDs.length > 0 ? (
                        <div className="space-y-2 text-sm max-h-32 overflow-y-auto">
                          {selectedPIDs.map((pidKey) => {
                            const metric = metrics.find((m) => m.key === pidKey)
                            if (!metric) return null
                            return (
                              <div key={pidKey} className="flex items-center justify-between bg-gray-700 rounded p-1.5">
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: metric.color }} />
                                  <span className="font-medium">{metric.label}</span>
                                  {metric.unit && <span className="text-xs text-gray-400">({metric.unit})</span>}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removePID(pidKey)}
                                  className="h-6 w-6 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">No PIDs selected</div>
                      )}
                      {selectedPIDs.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPIDs([])}
                          className="w-full mt-3 h-7 text-xs bg-gray-700 border-gray-600"
                        >
                          Clear All
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
                <div className="col-span-1 md:col-span-10">
                  <Card className="bg-gray-800 border-gray-700 h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h3 className="font-semibold">PID Analysis Charts</h3>
                    </div>
                    <div className="flex-1 p-4 pt-0">
                      {selectedPIDs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400">
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
                            const currentPidValueDataPoint = finalChartData.find((p) => p.time === pidDisplayTimeKey)
                            const currentPidValue = currentPidValueDataPoint
                              ? currentPidValueDataPoint[metric.key as string]
                              : null

                            return (
                              <div key={pidKey} className="bg-gray-700 rounded p-3 flex flex-col">
                                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                                  <h4 className="font-medium text-sm">{metric.label}</h4>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removePID(pidKey)}
                                    className="h-6 w-6 p-0"
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
                                      <XAxis dataKey="time" stroke="#9CA3AF" fontSize={10} />
                                      <YAxis stroke="#9CA3AF" fontSize={10} domain={["auto", "auto"]} />
                                      <Tooltip
                                        contentStyle={{
                                          backgroundColor: "#1F2937",
                                          border: "1px solid #374151",
                                          borderRadius: "6px",
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
                                  <span className="text-xs text-gray-400 ml-1">{metric.unit}</span>
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
                <Card className="bg-gray-800 border-gray-700 p-4 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">GPS Track Visualization</h3>
                    <div className="flex items-center gap-2">
                      <Map className="w-4 h-4" />
                      <span className="text-sm text-gray-400">
                        {data.filter((d) => d.latitude && d.longitude).length} GPS points
                      </span>
                    </div>
                  </div>
                  <div className="h-[calc(100%-3rem)]">
                    <GPSTrackMap data={data} currentTime={currentTime} />
                  </div>
                </Card>
              </div>
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
        </>
      )}
      {data.length === 0 && !isLoading && (
        <Card
          className={`bg-gray-800 border-gray-700 p-8 text-center transition-all duration-200 ${
            isDragOver ? "border-blue-500 bg-gray-700" : ""
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? "text-blue-400" : "text-gray-400"}`} />
          <h3 className="text-lg font-semibold mb-2">
            {isDragOver ? "Drop CSV file(s) here" : "Drag and drop CSV file(s) here"}
          </h3>
          <p className="text-gray-400 mb-4">Select one or multiple CSV files — multiple files will be merged automatically in order</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700">
              <Upload className="w-4 h-4 mr-2" />
              Choose CSV File(s)
            </Button>
            <Button
              onClick={loadSampleData}
              variant="outline"
              className="border-gray-600 hover:bg-gray-700 bg-transparent"
            >
              <FileText className="w-4 h-4 mr-2" />
              Load Sample Data
            </Button>
          </div>
        </Card>
      )}
      {showTransmissionDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="bg-gray-800 border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Transmission Configuration</h2>
                <Button onClick={() => setShowTransmissionDialog(false)} variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <Tabs defaultValue="manual" className="space-y-4">
                <TabsList className="flex w-full overflow-x-auto bg-gray-700">
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
                        type="number"
                        step="0.01"
                        value={transmissionConfig.finalDrive}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            finalDrive: Number.parseFloat(e.target.value) || 4.35,
                          }))
                        }
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Tyre Diameter (mm)</label>
                      <Input
                        type="number"
                        value={transmissionConfig.tyreDiameterMm}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            tyreDiameterMm: Number.parseInt(e.target.value) || 647,
                          }))
                        }
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Shift RPM</label>
                      <Input
                        type="number"
                        value={transmissionConfig.shiftRpm}
                        onChange={(e) =>
                          setTransmissionConfig((prev) => ({
                            ...prev,
                            shiftRpm: Number.parseInt(e.target.value) || 6900,
                          }))
                        }
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Number of Gears</label>
                      <Input
                        type="number"
                        min="3"
                        max="10"
                        value={transmissionConfig.numberOfGears}
                        onChange={(e) => {
                          const newGears = Number.parseInt(e.target.value) || 6
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
                        className="bg-gray-700 border-gray-600 text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-3">Gear Ratios</label>
                    <div className="grid grid-cols-4 gap-3">
                      {Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1).map((gear) => (
                        <div key={gear}>
                          <label className="block text-xs text-gray-400 mb-1">Gear {gear}</label>
                          <Input
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
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-3">Tire Size Calculator</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Tire Size (e.g., 235/35R19)</label>
                        <Input
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
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Calculated Diameter</label>
                        <div className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white">
                          {calculateTireDiameter(tireWidth, tireAspectRatio, tireRimSize)} mm
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Width (mm)</label>
                        <Input
                          type="number"
                          value={tireWidth}
                          onChange={(e) => {
                            const width = Number.parseInt(e.target.value) || 235
                            setTireWidth(width)
                            setTireSizeInput(`${width}/${tireAspectRatio}R${tireRimSize}`)
                            const diameter = calculateTireDiameter(width, tireAspectRatio, tireRimSize)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className="bg-gray-700 border-gray-600 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Aspect Ratio (%)</label>
                        <Input
                          type="number"
                          value={tireAspectRatio}
                          onChange={(e) => {
                            const aspect = Number.parseInt(e.target.value) || 35
                            setTireAspectRatio(aspect)
                            setTireSizeInput(`${tireWidth}/${aspect}R${tireRimSize}`)
                            const diameter = calculateTireDiameter(tireWidth, tireAspectRatio, tireRimSize)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className="bg-gray-700 border-gray-600 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Rim Size (inches)</label>
                        <Input
                          type="number"
                          value={tireRimSize}
                          onChange={(e) => {
                            const rim = Number.parseInt(e.target.value) || 19
                            setTireRimSize(rim)
                            setTireSizeInput(`${tireWidth}/${tireAspectRatio}R${rim}`)
                            const diameter = calculateTireDiameter(tireWidth, tireAspectRatio, rim)
                            setTransmissionConfig((prev) => ({ ...prev, tyreDiameterMm: diameter }))
                          }}
                          className="bg-gray-700 border-gray-600 text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="presets" className="space-y-4">
                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="Search presets..."
                        value={presetSearchQuery}
                        onChange={(e) => setPresetSearchQuery(e.target.value)}
                        className="pl-8 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-10 bg-gray-700 border-gray-600">
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Sort
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-800 border-gray-600 text-white">
                        <DropdownMenuItem
                          onClick={() => setPresetSortOption("default")}
                          className={presetSortOption === "default" ? "bg-gray-700" : ""}
                        >
                          Default Order
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setPresetSortOption("alphabetical")}
                          className={presetSortOption === "alphabetical" ? "bg-gray-700" : ""}
                        >
                          Alphabetical
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid gap-4">
                    {filteredTransmissionPresets.map((preset, index) => (
                      <Card key={index} className="bg-gray-700 border-gray-600 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-white">{preset.name}</h3>
                          <Button
                            size="sm"
                            onClick={() => {
                              setTransmissionConfig(preset.config)
                              showToast(`Applied "${preset.name}" configuration`)
                            }}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                          <div>Gears: {preset.config.numberOfGears}</div>
                          <div>Final Drive: {preset.config.finalDrive}</div>
                          <div>Shift RPM: {preset.config.shiftRpm}</div>
                          <div>Tire: {preset.config.tyreDiameterMm}mm</div>
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
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
                        const results = detectGearRatios(data)
                        setAutoDetectionResults(results)
                        setShowAutoDetection(true)
                      }}
                      disabled={data.length < 100}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Analyze Current Data
                    </Button>
                    <p className="text-sm text-gray-400 mt-2">
                      {data.length < 100
                        ? `Need at least 100 data points (currently ${data.length})`
                        : `Analyze ${data.length} data points to detect gear ratios`}
                    </p>
                  </div>

                  {autoDetection && (
                    <Card className="bg-gray-700 border-gray-600 p-4">
                      <h3 className="font-semibold text-white mb-3">Auto-Detection Results</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Detected Gears:</span>
                          <span className="text-white ml-2">{autoDetection.detectedGears}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Confidence:</span>
                          <span className="text-white ml-2">{autoDetection.confidence.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-white mb-2">Detected Gear Ratios:</h4>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          {Object.entries(autoDetection.gearRatios).map(([gear, ratio]) => (
                            <div key={gear} className="bg-gray-800 p-2 rounded">
                              <span className="text-gray-400">Gear {gear}:</span>
                              <span className="text-white ml-1">{(ratio as number).toFixed(3)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        onClick={() => {
                          setTransmissionConfig({
                            gearRatios: autoDetection.gearRatios,
                            finalDrive: autoDetection.estimatedFinalDrive,
                            tyreDiameterMm: autoDetection.estimatedTireDiameter,
                            shiftRpm: 7000,
                            numberOfGears: autoDetection.detectedGears,
                          })
                          showToast("Applied auto-detected transmission settings")
                        }}
                        className="mt-4 bg-blue-600 hover:bg-blue-700"
                        size="sm"
                      >
                        Apply Auto-Detected Settings
                      </Button>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="import-export" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-gray-700 border-gray-600 p-4">
                      <h3 className="font-semibold text-white mb-3">Export Configuration</h3>
                      <p className="text-sm text-gray-400 mb-4">
                        Save your current transmission settings to a JSON file.
                      </p>
                      <Button
                        onClick={() => exportTransmissionConfig(transmissionConfig)}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        Export Settings
                      </Button>
                    </Card>

                    <Card className="bg-gray-700 border-gray-600 p-4">
                      <h3 className="font-semibold text-white mb-3">Import Configuration</h3>
                      <p className="text-sm text-gray-400 mb-4">Load transmission settings from a JSON file.</p>
                      <input
                        ref={transmissionFileInputRef}
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            importTransmissionConfig(file, (config) => {
                              setTransmissionConfig(config)
                              showToast("Transmission configuration imported successfully")
                            })
                          }
                        }}
                        className="hidden"
                      />
                      <Button
                        onClick={() => transmissionFileInputRef.current?.click()}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        Import Settings
                      </Button>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between pt-6 border-t border-gray-600">
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
                  className="border-gray-600 hover:bg-gray-700"
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
                            ? calculateGear(point.speed, point.rpm, transmissionConfig)
                            : point.gear,
                      }))
                      setData(updatedData)
                    }
                    showToast("Transmission configuration applied")
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Apply Configuration
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] bg-gray-800 border border-gray-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  )
}
