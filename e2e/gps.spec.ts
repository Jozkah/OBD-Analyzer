import { test, expect } from "@playwright/test"
import { loadTrusted, gotoSection } from "./helpers"

test("route map shows speed in km/h for a km/h log", async ({ page }) => {
  await loadTrusted(page, { rows: 40, gps: true, speedUnit: "km/h" })
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("heading", { name: "Route Map" })).toBeVisible()
  const readout = page.getByText("Current Speed").locator("..")
  await expect(readout.getByText(/km\/h/)).toBeVisible()
})

test("route map shows speed in mph for an mph log (label matches value, no km/h)", async ({ page }) => {
  await loadTrusted(page, { rows: 40, gps: true, speedUnit: "mph" })
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("heading", { name: "Route Map" })).toBeVisible()
  const readout = page.getByText("Current Speed").locator("..")
  await expect(readout.getByText(/\bmph\b/)).toBeVisible()
  await expect(readout.getByText(/km\/h/)).toHaveCount(0)
})

test("shows a clear empty state when the log has no GPS", async ({ page }) => {
  await loadTrusted(page, { rows: 30, gps: false })
  await gotoSection(page, /Route/i)
  await expect(page.getByText(/No GPS data in this log/i)).toBeVisible()
})
