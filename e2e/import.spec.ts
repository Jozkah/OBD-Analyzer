import { test, expect } from "@playwright/test"
import { uploadCsv, uploadMany, trustedCsv, malformedCsv, headerOnlyCsv, partialCsv } from "./helpers"

function bar(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: /Playback and time range/i })
}

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

test("merges compatible sequential files: rows appended, timeline continuous and trusted", async ({ page }) => {
  await page.goto("/")
  // part-2's timestamps continue immediately after part-1 (0–19 s, then 20–39 s).
  await uploadMany(page, [
    { name: "part-1.csv", content: trustedCsv({ rows: 20, startSec: 0 }) },
    { name: "part-2.csv", content: trustedCsv({ rows: 20, startSec: 20 }) },
  ])
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  // Rows are appended: 40 total records.
  await expect(page.getByText(/40\s*records/i)).toBeVisible()
  await expect(page.getByText(/2 files merged/i)).toBeVisible()
  // Both source names are listed, in order.
  await expect(page.getByText("part-1.csv → part-2.csv")).toBeVisible()
  // The merged timeline is continuous & trusted: 0:00 → 0:39, no "sample" fallback badge.
  await expect(bar(page).getByText(/0:00\s*\/\s*0:39/).first()).toBeVisible()
  await expect(bar(page).getByText("sample", { exact: true })).toHaveCount(0)
})

test("overlapping timestamps merge in file order but are flagged non-monotonic (overlap policy)", async ({ page }) => {
  await page.goto("/")
  // Both parts cover 0–19 s, so the merged stream rewinds at the seam. Policy: concatenate in file
  // order and SURFACE the non-monotonic seam rather than silently reorder/drop rows.
  await uploadMany(page, [
    { name: "part-1.csv", content: trustedCsv({ rows: 20, startSec: 0 }) },
    { name: "part-2.csv", content: trustedCsv({ rows: 20, startSec: 0 }) },
  ])
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  // Rows are still all there (nothing dropped): 40 records.
  await expect(page.getByText(/40\s*records/i)).toBeVisible()
  // Position falls back to a sample index because the seam is not monotonic.
  await expect(bar(page).getByText("sample", { exact: true })).toBeVisible()
  // Data Health names the non-monotonic timestamps.
  await expect(page.getByText(/not.*chronological|non-?monotonic|go backwards|out of order/i).first()).toBeVisible()
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

test("an incompatible batch does not destroy an already-loaded session", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "good.csv", trustedCsv({ rows: 25 }))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await expect(page.getByText(/25\s*records/i)).toBeVisible()
  // Now try to import an incompatible pair.
  await uploadMany(page, [
    { name: "x.csv", content: "Time,Engine RPM (RPM),Vehicle speed (km/h)\n2024-01-01T00:00:00.000Z,1000,10\n" },
    { name: "y.csv", content: "Time,Engine RPM (RPM),Boost (bar)\n2024-01-01T00:00:00.000Z,1000,0.5\n" },
  ])
  await expect(page.getByRole("status").filter({ hasText: /differ|cannot merge/i }).first()).toBeVisible()
  // The original session survives intact.
  await expect(page.getByText(/25\s*records/i)).toBeVisible()
  await expect(page.getByText(/good\.csv/).first()).toBeVisible()
})

test("a second separate upload replaces the session (documented: append is per multi-select import)", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "first.csv", trustedCsv({ rows: 25 }))
  await expect(page.getByText(/25\s*records/i)).toBeVisible()
  // A second, separate upload is a NEW import — it replaces rather than appends.
  await uploadCsv(page, "second.csv", trustedCsv({ rows: 12 }))
  await expect(page.getByText(/12\s*records/i)).toBeVisible()
  await expect(page.getByText(/25\s*records/i)).toHaveCount(0)
  await expect(page.getByText(/second\.csv/).first()).toBeVisible()
})
