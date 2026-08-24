import { test, expect, type Page } from "@playwright/test"
import { loadTrusted, uploadCsv } from "./helpers"

// A log with two clearly-separated gear bands (constant RPM/speed within each), so gear detection
// has real clusters to find rather than a single continuous ramp.
function twoGearCsv(): string {
  const headers = [
    "Time",
    "Engine RPM (RPM)",
    "Vehicle speed (km/h)",
    "Absolute throttle position (%)",
    "Engine coolant temperature (°C)",
  ]
  const lines = [headers.join(",")]
  let i = 0
  const push = (rpm: number, speed: number) => {
    lines.push([new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(), rpm, speed, 60, 90].join(","))
    i++
  }
  for (let n = 0; n < 60; n++) push(2000 + n * 40, 20 + n * 0.4) // ratio ≈ 100 → a low gear
  for (let n = 0; n < 60; n++) push(2800 + n * 40, 62 + n * 0.9) // ratio ≈ 45 → a higher gear
  return lines.join("\n") + "\n"
}

async function openTransmission(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Transmission/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
}

const finalDrive = (page: Page) => page.getByLabel("Final Drive Ratio")

test("Apply commits the draft and it persists on reopen", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("5")
  await expect(page.getByText(/unsaved changes/i)).toBeVisible()
  await page.getByRole("button", { name: /Apply configuration/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toHaveCount(0)
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue("5")
})

test("Cancel discards the draft", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  const original = await finalDrive(page).inputValue()
  await finalDrive(page).fill("7")
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toHaveCount(0)
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue(original)
})

test("closing a dirty dialog asks before discarding", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("6")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("alertdialog").getByText(/discard unsaved changes/i)).toBeVisible()
  await page.getByRole("button", { name: /keep editing/i }).click()
  // Still open, edit preserved.
  await expect(finalDrive(page)).toHaveValue("6")
})

test("blank/invalid input is shown, not coerced, and blocks Apply with a field-level error", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  // Clearing the field leaves it blank (raw string), rather than snapping back to a default.
  await finalDrive(page).fill("")
  await expect(finalDrive(page)).toHaveValue("")
  await page.getByRole("button", { name: /Apply configuration/i }).click()
  // Apply is rejected: the dialog stays open and the field is flagged accessibly.
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
  await expect(finalDrive(page)).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByText(/final drive must be greater than 0/i).first()).toBeVisible()
  // A non-numeric string is also preserved and rejected.
  await finalDrive(page).fill("abc")
  await expect(finalDrive(page)).toHaveValue("abc")
})

test("a preset only fills the draft — nothing commits until Apply", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  const original = await finalDrive(page).inputValue()
  await page.getByRole("tab", { name: "Presets" }).click()
  await page.getByRole("button", { name: /Use preset Honda Civic Type R/i }).click()
  // Back on Manual, the draft reflects the preset (final drive 4.785).
  await page.getByRole("tab", { name: "Manual" }).click()
  await expect(finalDrive(page)).toHaveValue("4.785")
  // Discard without applying → the committed config is unchanged.
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /discard changes/i }).click()
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue(original)
})

test("Reset only changes the draft until Apply", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("9")
  await page.getByRole("button", { name: /Apply configuration/i }).click()
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue("9")
  // Reset fills the draft with defaults but does not commit on its own.
  await page.getByRole("button", { name: "Reset", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset", exact: true }).click()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /discard changes/i }).click()
  await openTransmission(page)
  // Discarded: the applied value (9) survives because Reset was never committed.
  await expect(finalDrive(page)).toHaveValue("9")
})

const validConfigJson = JSON.stringify({
  finalDrive: 3.15,
  tyreDiameterMm: 685,
  shiftRpm: 7200,
  numberOfGears: 7,
  gearRatios: { 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1.0, 7: 0.839 },
})

async function importJson(page: Page, name: string, content: string) {
  await page.getByRole("tab", { name: /Import\/Export/i }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(content),
  })
}

test("a valid import loads into the draft only, and Apply commits it", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await importJson(page, "config.json", validConfigJson)
  await page.getByRole("tab", { name: "Manual" }).click()
  await expect(finalDrive(page)).toHaveValue("3.15")
  await page.getByRole("button", { name: /Apply configuration/i }).click()
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue("3.15")
})

test("a malformed / invalid import is rejected and leaves the draft intact", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("5.55")
  // Malformed JSON.
  await importJson(page, "broken.json", "{not valid json")
  await page.getByRole("tab", { name: "Manual" }).click()
  await expect(finalDrive(page)).toHaveValue("5.55")
  // Structurally-valid JSON but schema-invalid (final drive out of range).
  await importJson(page, "bad.json", JSON.stringify({ finalDrive: -3, tyreDiameterMm: 600, shiftRpm: 7000, numberOfGears: 6, gearRatios: { 1: 3, 2: 2, 3: 1.5, 4: 1.2, 5: 1, 6: 0.8 } }))
  await page.getByRole("tab", { name: "Manual" }).click()
  await expect(finalDrive(page)).toHaveValue("5.55")
})

test("auto-detected settings load into the draft only", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "gears.csv", twoGearCsv())
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await openTransmission(page)
  const original = await finalDrive(page).inputValue()
  await page.getByRole("tab", { name: "Auto-detect" }).click()
  await page.getByRole("button", { name: /Analyse current data/i }).click()
  await page.getByRole("button", { name: /Use detected settings/i }).click()
  await page.getByRole("tab", { name: "Manual" }).click()
  // The draft now reflects the detection; discarding it leaves the committed config untouched.
  await expect(page.getByText(/unsaved changes/i)).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /discard changes/i }).click()
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue(original)
})
