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
