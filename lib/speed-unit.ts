import { safeMax } from "@/lib/stats"

// Helper function to detect speed unit from column names and data
export function detectSpeedUnit(headers: string[], data: any[]): "km/h" | "mph" {
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
