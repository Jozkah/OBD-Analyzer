import { test, expect } from "@playwright/test"
import { loadTrusted } from "./helpers"

test("exports the current window as a CSV download", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  await page.getByRole("button", { name: "More actions" }).click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("menuitem", { name: /Export window as CSV/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
})

test("exports the overview chart as a PNG download", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /Export chart as PNG/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.png$/)
})
