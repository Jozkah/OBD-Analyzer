import type { DataPoint, TransmissionConfig } from "@/types/obd"
import { safeMax, safeMin } from "@/lib/stats"

export function calculateGear(
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

export function getShiftIndicator(
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

export function detectGearRatios(data: DataPoint[], speedUnit: "km/h" | "mph" = "km/h"): any {
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
