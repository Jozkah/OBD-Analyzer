import type { DataPoint, MetricConfig, TransmissionConfig } from "@/types/obd"
import { parseCsvLine } from "@/lib/csv"
import { parseNumericValue, isNumericCell, detectCommaMeaning, type CommaMeaning } from "@/lib/parse-number"
import { calculateGear } from "@/lib/gear"
import { detectSpeedUnit } from "@/lib/speed-unit"
import { checkMissingCrucialPIDs } from "@/lib/crucial-pids"

// Pure, framework-free CSV parse extracted from app/page.tsx's parseCSV (#29) so it
// can run inside a Web Worker off the main thread. The logic is character-identical to
// the original; only the React setState calls become fields on the returned result and
// the early "empty"/"header-only" branches become tagged results.
export type ParseCsvResult =
  | { status: "empty" }
  | { status: "headerOnly" }
  | {
      status: "ok"
      data: DataPoint[]
      metrics: MetricConfig[]
      speedUnit: "km/h" | "mph"
      tripDurationUnit: string
      missingPIDs: ReturnType<typeof checkMissingCrucialPIDs>
    }

export function parseCsvText(text: string, transmissionConfig: TransmissionConfig): ParseCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"))

  // Guard against degenerate files. An empty, whitespace-only, or all-comment
  // file yields lines = [], so parseCsvLine(lines[0]) would call
  // parseCsvLine(undefined) and throw (swallowed by the catch below, leaving
  // stale data and zero user feedback). A header-only file (lines.length === 1)
  // parses to no data rows. Reset state and tell the user in both cases.
  if (lines.length === 0) {
    return { status: "empty" }
  }
  if (lines.length === 1) {
    return { status: "headerOnly" }
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
  // Raw numeric-cell strings sampled across the file to decide, once, whether a lone
  // comma is an EU decimal or a US thousands separator (see detectCommaMeaning / #18).
  // Bounded so huge logs don't grow this unboundedly; the convention is a file-wide
  // property, so a wide sample is plenty.
  const commaSample: string[] = []
  const COMMA_SAMPLE_CAP = 4000
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
          if (commaSample.length < COMMA_SAMPLE_CAP) commaSample.push(value)
        }
      }
    })
    if (buildSample && Object.keys(samplePoint).length > 0) {
      sampleData.push(samplePoint)
    }
  }

  // Decide the file's comma convention once; every numeric cell below is parsed with it.
  const commaMeaning: CommaMeaning = detectCommaMeaning(commaSample)

  // Detect speed unit from headers and sample data
  const detectedSpeedUnit = detectSpeedUnit(headers, sampleData)

  // Capture the Trip Duration column's unit so the readout can normalize to minutes
  // rather than assuming the raw value is already in minutes (some loggers emit
  // seconds, which would otherwise print e.g. a 30-minute trip as "30h 0min").
  const tripDurHeader = headers.find(
    (h) => h.toLowerCase().includes("trip") && h.toLowerCase().includes("duration"),
  )
  const tripDurationUnit = tripDurHeader ? extractUnit(tripDurHeader) || "min" : "min"

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

  // Precompute, once per numeric column, which standard field(s) its header maps to, so
  // the per-row loop below doesn't re-lowercase and re-scan every header on every row
  // (#29 — this was O(rows × columns × ~25 substring checks)). The classification mirrors
  // the original per-row mapping exactly, including the mutually-exclusive speed sub-cases
  // and the independent (non-exclusive) metric matches.
  const columnMeta = headers.map((header, colIdx) => {
    if (!numericColumns[colIdx]) return null
    const h = header.toLowerCase()
    const speedKind: "max" | "gps" | "vehicle" | "other" | null = h.includes("speed")
      ? h.includes("max")
        ? "max"
        : h.includes("gps")
          ? "gps"
          : h.includes("vehicle")
            ? "vehicle"
            : "other"
      : null
    return {
      speedKind,
      rpm: h.includes("rpm"),
      throttle: h.includes("throttle"),
      boost: h.includes("boost"),
      coolant: h.includes("coolant"),
      power: h.includes("power"),
      torque: h.includes("torque"),
      lat: h.includes("latitude"),
      lng: h.includes("longitude"),
      fuelRate: h.includes("fuel") && h.includes("rate"),
      intakeTemp: h.includes("intake") && h.includes("temp"),
      afr: h.includes("air/fuel") || h.includes("fuel/air") || h.includes("afr"),
      ignAdv: h.includes("ignition") && h.includes("advance"),
      catTemp: h.includes("catalyst") && h.includes("temp"),
      oilTemp: h.includes("oil") && h.includes("temp"),
      transTemp: h.includes("transmission") && h.includes("temp"),
      exhaustTemp: h.includes("exhaust") && h.includes("temp"),
      tripDuration: h.includes("trip") && h.includes("duration"),
      tripDistance: h.includes("trip") && h.includes("distance"),
      tripFuel: h.includes("trip") && h.includes("fuel") && !h.includes("economy"),
      tripFuelEconomy: h.includes("trip") && h.includes("fuel") && h.includes("economy"),
    }
  })

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

    for (let colIdx = 0; colIdx < columnMeta.length; colIdx++) {
      const m = columnMeta[colIdx]
      // Gate by the precomputed metadata (non-null iff the column is numeric).
      if (!m) continue
      const value = parseNumericValue(values[colIdx], commaMeaning)
      dataPoint[`col_${colIdx}`] = value

      // Map to standard properties. Speed sub-cases are mutually exclusive (mirroring the
      // original if/else-if); every other match is independent, so a header matching two
      // categories still sets both.
      if (m.rpm) dataPoint.rpm = value
      if (m.speedKind === "max") {
        // Store max speed separately, don't use it for real-time speed.
        dataPoint.maxSpeed = value
      } else if (m.speedKind === "gps") {
        dataPoint.gpsSpeed = value
        if (!dataPoint.speed) dataPoint.speed = value // GPS speed if no vehicle speed yet
      } else if (m.speedKind === "vehicle") {
        dataPoint.speed = value // vehicle speed is preferred
      } else if (m.speedKind === "other") {
        if (!dataPoint.speed) dataPoint.speed = value // any other speed if none set yet
      }
      if (m.throttle) dataPoint.throttle = value
      if (m.boost) dataPoint.boost = value
      if (m.coolant) dataPoint.coolantTemp = value
      if (m.power) dataPoint.enginePower = value
      if (m.torque) dataPoint.engineTorque = value
      if (m.lat) dataPoint.latitude = value
      if (m.lng) dataPoint.longitude = value
      if (m.fuelRate) dataPoint.fuelRate = value
      if (m.intakeTemp) dataPoint.intakeTemp = value
      if (m.afr) dataPoint.afr = value
      if (m.ignAdv) dataPoint.ignitionAdvance = value
      if (m.catTemp) dataPoint.catTemp = value
      if (m.oilTemp) dataPoint.oilTemp = value
      if (m.transTemp) dataPoint.transTemp = value
      if (m.exhaustTemp) dataPoint.exhaustTemp = value
      if (m.tripDuration) dataPoint.tripDuration = value
      if (m.tripDistance) dataPoint.tripDistance = value
      if (m.tripFuel) dataPoint.tripFuel = value
      if (m.tripFuelEconomy) dataPoint.tripFuelEconomy = value
    }

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

  return {
    status: "ok",
    data: parsedData,
    metrics: detectedMetrics,
    speedUnit: detectedSpeedUnit,
    tripDurationUnit,
    missingPIDs: pidCheck,
  }
}
