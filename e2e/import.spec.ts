import { test, expect } from "@playwright/test"
import { uploadCsv, uploadMany, trustedCsv, malformedCsv, headerOnlyCsv, partialCsv } from "./helpers"

test("imports a CSV chosen through the file input", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
  await uploadCsv(page, "drive.csv", trustedCsv({ rows: 40 }))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
})

test("shows an error and stays on the upload screen for a malformed CSV", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "broken.csv", malformedCsv())
  // A toast/status appears and the dashboard does not load.
  await expect(page.getByRole("status").filter({ hasText: /couldn't parse|empty|no data/i }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toHaveCount(0)
})

test("loads a partial log and flags the missing critical channel", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "partial.csv", partialCsv())
  // Vehicle Speed is missing → the missing-channels dialog appears; continue into the app.
  await expect(page.getByRole("heading", { name: /channels are missing/i })).toBeVisible()
  await page.getByRole("button", { name: /continue anyway/i }).click()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Data Health" })).toBeVisible()
})

test("reports a header-only CSV as having no data rows", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "headeronly.csv", headerOnlyCsv())
  await expect(page.getByRole("status").filter({ hasText: /no data rows|empty/i }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toHaveCount(0)
})

test("merges compatible sequential files into one session", async ({ page }) => {
  await page.goto("/")
  await uploadMany(page, [
    { name: "part-1.csv", content: trustedCsv({ rows: 20 }) },
    { name: "part-2.csv", content: trustedCsv({ rows: 20 }) },
  ])
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  // The header reflects a merge of two files.
  await expect(page.getByText(/2 files merged/i)).toBeVisible()
})

test("rejects incompatible files instead of silently mixing them", async ({ page }) => {
  await page.goto("/")
  const a = "Time,Engine RPM (RPM),Vehicle speed (km/h)\n2024-01-01T00:00:00.000Z,1000,10\n"
  const b = "Time,Engine RPM (RPM),Boost (bar)\n2024-01-01T00:00:00.000Z,1000,0.5\n"
  await uploadMany(page, [
    { name: "a.csv", content: a },
    { name: "b.csv", content: b },
  ])
  await expect(page.getByRole("status").filter({ hasText: /differ|cannot merge/i }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toHaveCount(0)
})
