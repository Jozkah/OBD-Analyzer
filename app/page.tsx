"use client"

import { useMemo } from "react"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Upload, Play, Pause, RotateCcw, FileText, Map, BarChart3, Search, ChevronDown, Plus, X } from "lucide-react"
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
} from "recharts"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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

// Enhanced GPS Track Map Component with proper map base
function GPSTrackMap({ data, currentTime }: { data: DataPoint[]; currentTime: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapStyle, setMapStyle] = useState<"satellite" | "street" | "terrain">("satellite")
  const [satelliteTexture, setSatelliteTexture] = useState<HTMLImageElement | null>(null)

  // Load satellite texture
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = "/images/satellite-texture.png"
    img.onload = () => setSatelliteTexture(img)
    img.onerror = () => console.error("Failed to load satellite texture. Ensure /images/satellite-texture.png exists.")
  }, [])

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
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const padding = 40
    const latRange = maxLat - minLat || 0.001
    const lngRange = maxLng - minLng || 0.001

    ctx.clearRect(0, 0, width, height)

    if (mapStyle === "satellite") {
      if (satelliteTexture) {
        const pattern = ctx.createPattern(satelliteTexture, "repeat")
        if (pattern) {
          ctx.fillStyle = pattern
          ctx.fillRect(0, 0, width, height)
        } else {
          ctx.fillStyle = "#1a1a2e"
          ctx.fillRect(0, 0, width, height)
        }
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 0, height)
        gradient.addColorStop(0, "#1a1a2e")
        gradient.addColorStop(1, "#16213e")
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
      }
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
  }, [gpsData, currentTime, mapStyle, data, satelliteTexture])

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

export default function AutomotiveAnalyzer() {
  const [data, setData] = useState<DataPoint[]>([])
  const [metrics, setMetrics] = useState<MetricConfig[]>(defaultMetrics)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [timeRange, setTimeRange] = useState([0, 100])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [searchQuery, setSearchQuery] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sortOption, setSortOption] = useState<"default" | "alphabetical">("default")
  const [selectedTempSensors, setSelectedTempSensors] = useState<string[]>(["coolantTemp", "intakeTemp"])
  const [selectedPIDs, setSelectedPIDs] = useState<string[]>([])
  const [showEmptyPIDs, setShowEmptyPIDs] = useState(false)
  const [pidAnalysisHoveredTimeKey, setPidAnalysisHoveredTimeKey] = useState<number | null>(null)

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

  const parseCSV = useCallback(async (file: File) => {
    setIsLoading(true)
    try {
      const text = await file.text()
      const lines = text.split("\n")
      const headers = lines[0].split(",").map((h) => h.trim())
      const shortenColumnName = (name: string): string => {
        const cleanName = name.replace(/[()]/g, "").replace(/\s+/g, " ").trim()
        const abbreviations: { [key: string]: string } = {
          Time: "Time",
          "Fuel system 1 status": "Fuel Sys 1",
          "Fuel system 2 status": "Fuel Sys 2",
          "Calculated load value": "Load Val",
          "Engine coolant temperature": "Coolant Temp",
          "Short term fuel % trim - Bank 1": "STFT B1",
          "Short term fuel % trim - Bank 3": "STFT B3",
          "Long term fuel % trim - Bank 1": "LTFT B1",
          "Long term fuel % trim - Bank 3": "LTFT B3",
          "Intake manifold absolute pressure": "MAP",
          "Engine RPM": "RPM",
          "Vehicle speed": "Speed",
          "Ignition timing advance for #1 cylinder": "Ignition Adv",
          "Intake air temperature": "Intake Temp",
          "Mass air flow rate": "MAF",
          "Absolute throttle position": "Throttle",
          "Absolute throttle position B": "Throttle B",
          "Location of oxygen sensors": "O2 Sens Loc",
          "O2 voltage (Bank 1 Sensor 2)": "O2V B1S2",
          "O2 voltage Bank 1 Sensor 2": "O2V B1S2",
          "Short term fuel trim (Bank 1 Sensor 2)": "STFT B1S2",
          "Short term fuel trim Bank 1 Sensor 2": "STFT B1S2",
          "OBD requirements to which vehicle or engine is certified": "OBD Cert",
          "Time since engine start": "Eng Run Time",
          "Distance traveled while MIL is activated": "MIL Dist",
          "Fuel rail pressure": "Fuel Press",
          "Commanded evaporative purge": "Evap Purge",
          "Number of warm-ups since DTCs cleared": "Warmups",
          "Distance traveled since DTCs cleared": "DTC Dist",
          "Barometric pressure": "Baro Press",
          "O2 sensor lambda wide range (current probe) (Bank 1 Sensor 1)": "O2 Lambda B1S1",
          "O2 sensor lambda wide range Bank 1 Sensor 1": "O2 Lambda B1S1",
          "O2 sensor current wide range (Bank 1 Sensor 1)": "O2 Curr B1S1",
          "O2 sensor current wide range Bank 1 Sensor 1": "O2 Curr B1S1",
          "Catalyst temperature (Bank 1 Sensor 1)": "Cat Temp B1S1",
          "Catalyst temperature Bank 1 Sensor 1": "Cat Temp B1S1",
          "Control module voltage": "Battery",
          "Fuel/Air commanded equivalence ratio": "Fuel/Air Cmd",
          "Accelerator pedal position D": "Pedal D",
          "Accelerator pedal position E": "Pedal E",
          "Commanded throttle actuator control": "Cmd Throttle Act",
          "Engine run time run while MIL is activated": "MIL Run Time",
          "Engine run time while MIL is activated": "MIL Run Time",
          "Engine run time since DTCs cleared": "DTC Run Time",
          "Instant fuel economy": "Inst FE",
          "Total fuel economy": "Total FE",
          "Fuel rate": "Fuel Rate",
          "Instant CO2 rate": "Inst CO2",
          "Total CO2": "Total CO2",
          "CO2 flow": "CO2 Flow",
          "Trip Distance": "Trip Dist",
          "Trip Fuel": "Trip Fuel",
          "Trip Fuel Economy": "Trip FE",
          "Trip Duration": "Trip Time",
          "Hard Brake Count": "Hard Brakes",
          "Hard Accel Count": "Hard Accels",
          "Idling Count": "Idle Count",
          "Seconds Idling": "Idle Time",
          "Max Speed": "Max Speed",
          Boost: "Boost",
          "Engine Power": "Power",
          "Engine Torque": "Torque",
          "Fuel Remaining": "Fuel Left",
          "Distance to empty": "Range",
          Latitude: "Lat",
          Longitude: "Lng",
          Altitude: "Alt",
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
        const nameWithoutUnits = cleanName.replace(/\s*$$[^)]*$$\s*$/, "").trim()
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
          barometric: "Baro",
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
        if (lower.includes("ignition") && lower.includes("advance")) return "°"
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
      for (let i = 1; i < Math.min(lines.length, 10); i++) {
        const values = lines[i].split(",")
        headers.forEach((header, index) => {
          if (header.toLowerCase() === "time") return
          const value = values[index]
          if (value && !isNaN(Number.parseFloat(value))) {
            numericColumns[header] = true
          }
        })
      }
      let metricIndex = 0
      headers.forEach((header, colIdx) => {
        if (header.toLowerCase() === "time" || !numericColumns[header]) return
        const key = `col_${colIdx}`
        detectedMetrics.push({
          key: key,
          label: shortenColumnName(header),
          color: generateColor(metricIndex),
          unit: extractUnit(header),
          enabled: metricIndex < 6,
          originalName: header,
        })
        metricIndex++
      })
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",")
        if (values.length < headers.length) continue
        const dataPoint: DataPoint = { time: i - 1, timestamp: values[0] || `${i - 1}s` } as DataPoint
        headers.forEach((header, colIdx) => {
          if (!numericColumns[header]) return
          const key = `col_${colIdx}`
          const value = Number.parseFloat(values[colIdx]) || 0
          dataPoint[key] = value
          const lowerHeader = header.toLowerCase()
          if (lowerHeader.includes("rpm")) dataPoint.rpm = value
          if (lowerHeader.includes("speed") && lowerHeader.includes("km")) dataPoint.speed = value
          if (lowerHeader.includes("throttle")) dataPoint.throttle = value
          if (lowerHeader.includes("boost")) dataPoint.boost = value
          if (lowerHeader.includes("coolant")) dataPoint.coolantTemp = value
          if (lowerHeader.includes("power")) dataPoint.enginePower = value
          if (lowerHeader.includes("torque")) dataPoint.engineTorque = value
          if (lowerHeader.includes("latitude")) dataPoint.latitude = value
          if (lowerHeader.includes("longitude")) dataPoint.longitude = value
          if (lowerHeader.includes("fuel") && lowerHeader.includes("rate")) dataPoint.fuelRate = value
          if (lowerHeader.includes("intake") && lowerHeader.includes("temp")) dataPoint.intakeTemp = value
          if (lowerHeader.includes("air/fuel") || lowerHeader.includes("afr")) dataPoint.afr = value
          if (lowerHeader.includes("ignition") && lowerHeader.includes("advance")) dataPoint.ignitionAdvance = value
          if (lowerHeader.includes("catalyst") && lowerHeader.includes("temp")) dataPoint.catTemp = value
          if (lowerHeader.includes("oil") && lowerHeader.includes("temp")) dataPoint.oilTemp = value
          if (lowerHeader.includes("transmission") && lowerHeader.includes("temp")) dataPoint.transTemp = value
          if (lowerHeader.includes("exhaust") && lowerHeader.includes("temp")) dataPoint.exhaustTemp = value
        })
        if (!dataPoint.brake && dataPoint.throttle)
          dataPoint.brake = Math.max(0, (100 - dataPoint.throttle) * Math.random() * 0.3)
        if (!dataPoint.gear && dataPoint.speed) dataPoint.gear = Math.floor(dataPoint.speed / 25) + 1
        parsedData.push(dataPoint)
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
  }, [])

  const loadSampleData = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/sample-data.csv")
      const csvText = await response.text()
      const blob = new Blob([csvText], { type: "text/csv" })
      const file = new File([blob], "sample-data.csv", { type: "text/csv" })
      await parseCSV(file)
    } catch (error) {
      console.error("Error loading sample data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [parseCSV])

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file && file.type === "text/csv") {
        setSelectedFile(file)
        parseCSV(file)
      }
    },
    [parseCSV],
  )

  const toggleMetric = useCallback((index: number) => {
    setMetrics((prev) => prev.map((metric, i) => (i === index ? { ...metric, enabled: !metric.enabled } : metric)))
  }, [])

  // Check if a metric has all zero values
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
      return { maxRPM: 0, maxSpeed: 0, avgThrottle: 0, maxBoost: 0, avgCoolant: 0, maxPower: 0, maxTorque: 0 }
    return {
      maxRPM: Math.max(0, ...data.map((d) => d.rpm || 0)),
      maxSpeed: Math.max(0, ...data.map((d) => d.speed || 0)),
      avgThrottle: data.length > 0 ? data.reduce((sum, d) => sum + (d.throttle || 0), 0) / data.length : 0,
      maxBoost: Math.max(0, ...data.map((d) => d.boost || 0)),
      avgCoolant: data.length > 0 ? data.reduce((sum, d) => sum + (d.coolantTemp || 0), 0) / data.length : 0,
      maxPower: Math.max(0, ...data.map((d) => d.enginePower || 0)),
      maxTorque: Math.max(0, ...data.map((d) => d.engineTorque || 0)),
    }
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

  // Static height for all tabs - no more dynamic calculations
  const STATIC_HEIGHT = 600
  const metricsListHeight = Math.min(400, filteredMetrics.length * 35 + 100)
  const pidAnalysisHeight =
    selectedPIDs.length > 6 ? STATIC_HEIGHT + (Math.ceil(selectedPIDs.length / 2) - 3) * 250 : STATIC_HEIGHT

  const pidDisplayTimeKey = pidAnalysisHoveredTimeKey !== null ? pidAnalysisHoveredTimeKey : currentTime

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Automotive Data Analyzer</h1>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="bg-gray-800 border-gray-600 hover:bg-gray-700"
          >
            <Upload className="w-4 h-4 mr-2" /> Load CSV
          </Button>
          <Button onClick={loadSampleData} variant="outline" className="bg-gray-800 border-gray-600 hover:bg-gray-700">
            <FileText className="w-4 h-4 mr-2" /> Load Sample
          </Button>
          {selectedFile && (
            <span className="text-sm text-gray-400">
              {selectedFile.name} ({data.length} records)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
                  onValueChange={([value]) => setCurrentTime(value)}
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
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5 bg-gray-800">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="engine">Engine</TabsTrigger>
              <TabsTrigger value="analysis">PID Analysis</TabsTrigger>
              <TabsTrigger value="gps">GPS Track</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-12 gap-4" style={{ height: `${STATIC_HEIGHT}px` }}>
                <div className="col-span-2">
                  <Card className="bg-gray-800 border-gray-700 h-full flex flex-col">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <h3 className="font-semibold mb-3">Metrics ({metrics.length})</h3>
                      <div className="flex gap-2 mb-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            placeholder="Search metrics..."
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
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={setShowEmptyPIDs} />
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
                            <span className="text-red-400">{currentDataPoint.rpm?.toFixed(0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Speed:</span>
                            <span className="text-green-400">{currentDataPoint.speed?.toFixed(1)} km/h</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Throttle:</span>
                            <span className="text-yellow-400">{currentDataPoint.throttle?.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Gear:</span>
                            <span className="text-blue-400">{currentDataPoint.gear || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
                <div className="col-span-7">
                  <Card className="bg-gray-800 border-gray-700 p-4 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Time Series Analysis</h3>
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
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
                <div className="col-span-3">
                  <Card className="bg-gray-800 border-gray-700 p-4 h-full">
                    <h3 className="font-semibold mb-4">Session Statistics</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span>Max RPM:</span>
                        <span className="text-red-400 font-bold">{stats.maxRPM.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Speed:</span>
                        <span className="text-green-400 font-bold">{stats.maxSpeed.toFixed(1)} km/h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Throttle:</span>
                        <span className="text-yellow-400 font-bold">{stats.avgThrottle.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Boost:</span>
                        <span className="text-blue-400 font-bold">{stats.maxBoost.toFixed(2)} bar</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Coolant:</span>
                        <span className="text-purple-400 font-bold">{stats.avgCoolant.toFixed(1)}°C</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Power:</span>
                        <span className="text-pink-400 font-bold">{stats.maxPower.toFixed(0)} hp</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max Torque:</span>
                        <span className="text-lime-400 font-bold">{stats.maxTorque.toFixed(0)} N•m</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration:</span>
                        <span className="text-gray-300">{(data.length / 10).toFixed(1)}s</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-0">
              <div className="grid grid-cols-2 gap-4" style={{ height: `${STATIC_HEIGHT}px` }}>
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">RPM vs Speed Analysis</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="speed" stroke="#9CA3AF" fontSize={12} />
                        <YAxis dataKey="rpm" stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
                          }}
                        />
                        <Line dataKey="rpm" stroke="#ef4444" strokeWidth={2} dot={false} name="RPM" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Throttle vs Speed</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="speed" stroke="#9CA3AF" fontSize={12} />
                        <YAxis dataKey="throttle" stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
                          }}
                        />
                        <Line dataKey="throttle" stroke="#eab308" strokeWidth={2} dot={false} name="Throttle (%)" />
                      </LineChart>
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
                            ? Array.from(
                                { length: Math.max(1, ...finalChartData.map((d) => d.gear || 0)) },
                                (_, i) => i + 1,
                              )
                                .map((g) => ({ gear: g, count: finalChartData.filter((d) => d.gear === g).length }))
                                .filter((item) => item.count > 0)
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
                        />
                        <Bar dataKey="count" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="engine" className="space-y-0">
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
                            />
                          )
                        })}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="bg-gray-800 border-gray-700 p-4 flex flex-col">
                  <h3 className="font-semibold mb-4 flex-shrink-0">Air/Fuel Ratio (AFR)</h3>
                  <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                        <YAxis stroke="#9CA3AF" fontSize={12} domain={["dataMin - 1", "dataMax + 1"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
                          }}
                        />
                        <Line dataKey="afr" stroke="#f59e0b" strokeWidth={2} dot={false} name="AFR" />
                      </LineChart>
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
                        />
                        <Line
                          dataKey="ignitionAdvance"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          name="Ignition Advance (°)"
                        />
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
                        <YAxis stroke="#9CA3AF" fontSize={12} domain={["dataMin - 0.2", "dataMax + 0.2"]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "6px",
                          }}
                        />
                        <Line dataKey="boost" stroke="#06b6d4" strokeWidth={3} dot={false} name="Boost (bar)" />
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
                        />
                        <Area
                          dataKey="fuelRate"
                          fill="#f59e0b"
                          fillOpacity={0.3}
                          stroke="#f59e0b"
                          name="Fuel Rate (l/hr)"
                        />
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
                        />
                        <Area
                          dataKey="throttle"
                          fill="#22c55e"
                          fillOpacity={0.3}
                          stroke="#22c55e"
                          name="Throttle (%)"
                        />
                        <Area dataKey="brake" fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" name="Brake (%)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="analysis" className="space-y-0">
              <div className="grid grid-cols-12 gap-4" style={{ height: `${pidAnalysisHeight}px` }}>
                <div className="col-span-2">
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
                                <Checkbox checked={showEmptyPIDs} onCheckedChange={setShowEmptyPIDs} />
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
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                >
                                  <Plus className="h-3 w-3" />
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
                <div className="col-span-10">
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
                                      onMouseMove={(chartState) => {
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
                                      />
                                      <Line
                                        dataKey={metric.key as string}
                                        stroke={metric.color}
                                        strokeWidth={2}
                                        dot={false}
                                        name={`${metric.label} (${metric.unit})`}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="text-center mt-2 flex-shrink-0">
                                  <span className="text-lg font-bold" style={{ color: metric.color }}>
                                    {typeof currentPidValue === "number" ? currentPidValue.toFixed(2) : "N/A"}
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
            </TabsContent>
          </Tabs>
        </>
      )}
      {data.length === 0 && !isLoading && (
        <Card className="bg-gray-800 border-gray-700 p-8 text-center">
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold mb-2">No Data Loaded</h3>
          <p className="text-gray-400 mb-4">Upload a CSV file containing automotive log data to begin analysis</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700">
              <Upload className="w-4 h-4 mr-2" />
              Choose CSV File
            </Button>
            <Button onClick={loadSampleData} variant="outline" className="border-gray-600 hover:bg-gray-700">
              <FileText className="w-4 h-4 mr-2" />
              Load Sample Data
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
