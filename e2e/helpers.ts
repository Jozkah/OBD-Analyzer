import { type Page, expect } from "@playwright/test"

// ---- Synthetic CSV builders (uploaded as in-memory buffers, no fixture files needed) ----

function iso(i: number, stepSec = 1, startSec = 0): string {
  return new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + (startSec + i * stepSec) * 1000).toISOString()
}

interface TrustedOpts {
  rows?: number
  speedUnit?: "km/h" | "mph"
  gps?: boolean
  stepSec?: number
  /** Seconds offset for the first row's timestamp — lets a second file continue after the first. */
  startSec?: number
}

/** A well-formed log with trustworthy ISO timestamps, RPM, speed, throttle (+optional GPS). */
export function trustedCsv(opts: TrustedOpts = {}): string {
  const { rows = 30, speedUnit = "km/h", gps = false, stepSec = 1, startSec = 0 } = opts
  // Include all four crucial PIDs (RPM, speed, throttle, coolant) so a full log triggers no
  // missing-channel dialog.
  const headers = [
    "Time",
    "Engine RPM (RPM)",
    `Vehicle speed (${speedUnit})`,
    "Absolute throttle position (%)",
    "Engine coolant temperature (°C)",
  ]
  if (gps) headers.push("Latitude (deg)", "Longitude (deg)")
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    // A launch: speed and rpm ramp up so acceleration/gear logic has something to chew on.
    const rpm = 1000 + i * 180
    const speed = i * (speedUnit === "mph" ? 2 : 3)
    const throttle = Math.min(100, i * 4)
    const coolant = 80 + Math.min(20, i)
    const row = [iso(i, stepSec, startSec), rpm, speed, throttle, coolant]
    if (gps) row.push((51.5 + i * 0.0005).toFixed(5), (-0.1 - i * 0.0005).toFixed(5))
    lines.push(row.join(","))
  }
  return lines.join("\n") + "\n"
}

/** A log whose Time column is an index, not a clock → untrustworthy timestamps. */
export function untrustedCsv(rows = 30): string {
  const lines = ["Time,Engine RPM (RPM),Vehicle speed (km/h),Absolute throttle position (%),Engine coolant temperature (°C)"]
  for (let i = 0; i < rows; i++) lines.push(`${i},${1000 + i * 100},${i * 3},${Math.min(100, i * 4)},${80 + Math.min(20, i)}`)
  return lines.join("\n") + "\n"
}

/** Only comment/blank lines → the parser has nothing to read (degenerate/empty). */
export function malformedCsv(): string {
  return "# just a comment\n\n#\n   \n"
}

/** Header row but no data rows. */
export function headerOnlyCsv(): string {
  return "Time,Engine RPM (RPM),Vehicle speed (km/h)\n"
}

/** A log missing a critical channel (Vehicle Speed) → data-health flags it. */
export function partialCsv(rows = 20): string {
  const lines = ["Time,Engine RPM (RPM),Engine coolant temperature (°C)"]
  for (let i = 0; i < rows; i++) {
    lines.push(`${new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString()},${1000 + i * 100},${80 + i}`)
  }
  return lines.join("\n") + "\n"
}

/**
 * A trustworthy log whose GPS fixes all sit within a few metres — a parked/stationary car. The
 * route is degenerate (no path to draw) but the fixes, speed and count remain valid. Jitter stays
 * well under the ~20 m stationary threshold (≈0.00005° ≈ 5 m).
 */
export function stationaryGpsCsv(rows = 30): string {
  const headers = [
    "Time",
    "Engine RPM (RPM)",
    "Vehicle speed (km/h)",
    "Absolute throttle position (%)",
    "Engine coolant temperature (°C)",
    "Latitude (deg)",
    "Longitude (deg)",
  ]
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    const lat = 51.5 + (i % 2 === 0 ? 0.00003 : -0.00003)
    const lng = -0.1 + (i % 3 === 0 ? 0.00003 : -0.00003)
    lines.push([iso(i), 800 + (i % 5) * 10, 0, 0, 88, lat.toFixed(5), lng.toFixed(5)].join(","))
  }
  return lines.join("\n") + "\n"
}

/**
 * A moving log where only a fraction of rows carry a location fix (the rest have blank lat/lon),
 * so GPS coverage classifies as "sparse". The fixes that exist do move (non-degenerate).
 */
export function sparseGpsCsv(rows = 40, everyNth = 10): string {
  const headers = [
    "Time",
    "Engine RPM (RPM)",
    "Vehicle speed (km/h)",
    "Absolute throttle position (%)",
    "Engine coolant temperature (°C)",
    "Latitude (deg)",
    "Longitude (deg)",
  ]
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    const hasFix = i % everyNth === 0
    const lat = hasFix ? (51.5 + i * 0.001).toFixed(5) : ""
    const lng = hasFix ? (-0.1 - i * 0.001).toFixed(5) : ""
    lines.push([iso(i), 1000 + i * 50, i * 3, Math.min(100, i * 3), 85, lat, lng].join(","))
  }
  return lines.join("\n") + "\n"
}

// A long, ugly filename to prove header/session-identity truncation.
export const LONG_FILE_NAME =
  "2024-05-17_track-day_session-3_full-log_with-a-deliberately-very-long-name_export_final_v2.csv"

/**
 * A dense log with MANY channels, including long and near-duplicate PID names, and a configurable
 * (large) row count — enough to exercise the real table + chart layout rather than the 38-row
 * sample. Deterministic values so snapshots/assertions stay stable.
 */
export function densePidsCsv(rows = 1500): string {
  const headers = [
    "Time",
    "Engine RPM (RPM)",
    "Vehicle speed (km/h)",
    "Absolute throttle position (%)",
    "Engine coolant temperature (°C)",
    // Long / near-duplicate names that are indistinguishable when truncated without their unit/bank.
    "Short term fuel trim — Bank 1 (%)",
    "Short term fuel trim — Bank 2 (%)",
    "Long term fuel trim — Bank 1 (%)",
    "Long term fuel trim — Bank 2 (%)",
    "Intake manifold absolute pressure (kPa)",
    "Mass air flow rate (g/s)",
    "Oxygen sensor voltage — Bank 1 Sensor 1 (V)",
    "Oxygen sensor voltage — Bank 1 Sensor 2 (V)",
    "Ambient air temperature (°C)",
    "Barometric pressure (kPa)",
    "Engine oil temperature (°C)",
    "Commanded equivalence ratio (lambda)",
  ]
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    const rpm = 900 + ((i * 37) % 6000)
    const speed = (i * 7) % 180
    const throttle = (i * 3) % 100
    const coolant = 70 + (i % 30)
    const stftB1 = (Math.sin(i / 9) * 8).toFixed(2)
    const stftB2 = (Math.sin(i / 9 + 0.4) * 8).toFixed(2)
    const ltftB1 = (Math.cos(i / 14) * 5).toFixed(2)
    const ltftB2 = (Math.cos(i / 14 + 0.3) * 5).toFixed(2)
    const map = 20 + ((i * 11) % 200)
    const maf = (2 + ((i * 13) % 150) / 3).toFixed(1)
    const o2a = (0.1 + ((i % 18) / 20)).toFixed(3)
    const o2b = (0.1 + ((i % 16) / 20)).toFixed(3)
    const ambient = 12 + (i % 15)
    const baro = 98 + (i % 6)
    const oil = 70 + (i % 40)
    const lambda = (0.9 + ((i % 20) / 100)).toFixed(3)
    lines.push(
      [iso(i), rpm, speed, throttle, coolant, stftB1, stftB2, ltftB1, ltftB2, map, maf, o2a, o2b, ambient, baro, oil, lambda].join(","),
    )
  }
  return lines.join("\n") + "\n"
}

export const uploadInput = 'input[type="file"]'

export async function uploadCsv(page: Page, name: string, content: string) {
  await page.locator(uploadInput).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) })
}

export async function uploadMany(page: Page, files: { name: string; content: string }[]) {
  await page.locator(uploadInput).setInputFiles(
    files.map((f) => ({ name: f.name, mimeType: "text/csv", buffer: Buffer.from(f.content) })),
  )
}

/** Load a well-formed session and wait for the dashboard to appear. */
export async function loadTrusted(page: Page, opts: TrustedOpts = {}) {
  await page.goto("/")
  await uploadCsv(page, "trusted.csv", trustedCsv(opts))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
}

export function primaryNav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" }).first()
}

export async function gotoSection(page: Page, name: RegExp) {
  await primaryNav(page).getByRole("button", { name }).click()
}

/** Force a theme deterministically (mirrors the app's pre-hydration theme script). */
export async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(t)
    try {
      localStorage.setItem("obd-theme", t)
    } catch {
      /* storage may be unavailable */
    }
  }, theme)
}

/** Objective assertion that the PAGE itself never scrolls horizontally (internal scroll is fine). */
export async function expectNoPageOverflow(page: Page, ctx: string) {
  const { scrollW, innerW } = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return { scrollW: el.scrollWidth, innerW: window.innerWidth }
  })
  expect(scrollW, `horizontal overflow ${ctx}: scrollWidth ${scrollW} > innerWidth ${innerW}`).toBeLessThanOrEqual(
    innerW + 1,
  )
}

/** Assert a locator is visible AND fully inside the viewport (not clipped/off-screen). */
export async function expectInViewport(page: Page, locator: ReturnType<Page["getByRole"]>, ctx: string) {
  await expect(locator, `${ctx}: not visible`).toBeVisible()
  const box = await locator.boundingBox()
  const innerW = await page.evaluate(() => window.innerWidth)
  expect(box, `${ctx}: no box`).not.toBeNull()
  expect(box!.x, `${ctx}: off left`).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, `${ctx}: clipped right`).toBeLessThanOrEqual(innerW + 1)
}
