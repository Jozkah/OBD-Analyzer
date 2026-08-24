import { test, expect } from "@playwright/test"
import { loadTrusted, uploadCsv, untrustedCsv, gotoSection } from "./helpers"

test("overview chart labels its x-axis 'Time' for trustworthy timestamps", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  // Recharts renders the axis label as SVG text.
  await expect(page.locator("svg text", { hasText: "Time" }).first()).toBeVisible()
})

test("overview chart labels its x-axis 'Sample' when timestamps are untrustworthy", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "untrusted.csv", untrustedCsv(40))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await expect(page.locator("svg text", { hasText: "Sample" }).first()).toBeVisible()
})

test("channels explorer filters and inspects channels", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
  // Category filter narrows the table.
  await page.getByRole("button", { name: "Driving", exact: true }).click()
  await page.getByPlaceholder("Search channels…").fill("rpm")
  await page.getByRole("button", { name: /Add .* to charts|Inspect/i }).first().click()
  await expect(page.getByRole("heading", { name: /Inspector/i })).toBeVisible()
})
