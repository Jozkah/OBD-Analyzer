import type { DataPoint } from "@/types/obd"
import { CRUCIAL_PIDS } from "@/lib/constants"

// Function to check for missing crucial PIDs
export function checkMissingCrucialPIDs(
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
