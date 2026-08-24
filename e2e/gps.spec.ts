import { test, expect, type Page } from "@playwright/test"
import { loadTrusted, gotoSection } from "./helpers"

// The trusted fixture sets speed = i × (mph ? 2 : 3); at the last of 40 samples (i = 39) that is
// 117 km/h or 78 mph. Jumping to the end lets us assert the EXACT numeric readout, proving the map
// shows the log's raw value in its own unit with no conversion.
async function jumpToEnd(page: Page) {
  await page.getByRole("region", { name: /Playback and time range/i }).getByRole("button", { name: "Jump to end" }).click()
}

test("route map shows the exact km/h value for a km/h log", async ({ page }) => {
  await loadTrusted(page, { rows: 40, gps: true, speedUnit: "km/h" })
  await jumpToEnd(page)
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("heading", { name: "Route Map" })).toBeVisible()
  const readout = page.getByText("Current Speed").locator("..")
  await expect(readout.getByText("117.0 km/h")).toBeVisible()
})

test("route map shows the exact mph value for an mph log (label matches value, no km/h)", async ({ page }) => {
  await loadTrusted(page, { rows: 40, gps: true, speedUnit: "mph" })
  await jumpToEnd(page)
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("heading", { name: "Route Map" })).toBeVisible()
  const readout = page.getByText("Current Speed").locator("..")
  await expect(readout.getByText("78.0 mph")).toBeVisible()
  await expect(readout.getByText(/km\/h/)).toHaveCount(0)
})

test("shows a clear empty state when the log has no GPS", async ({ page }) => {
  await loadTrusted(page, { rows: 30, gps: false })
  await gotoSection(page, /Route/i)
  await expect(page.getByText(/No GPS data in this log/i)).toBeVisible()
})
