import type { MetricConfig } from "@/types/obd"

export const defaultMetrics: MetricConfig[] = [
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
export const CRUCIAL_PIDS = [
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
