import { test, expect } from "@playwright/test"
import { loadTrusted, uploadCsv, untrustedCsv } from "./helpers"

function bar(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: /Playback and time range/i })
}

test("shows real elapsed time for trustworthy timestamps", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  const region = bar(page)
  await expect(region).toBeVisible()
  // Elapsed position is an M:SS clock, and there is no "sample" fallback badge.
  await expect(region.getByText(/\d+:\d{2}\s*\/\s*\d+:\d{2}/).first()).toBeVisible()
  await expect(region.getByText("sample", { exact: true })).toHaveCount(0)
})

test("labels position as a sample index when timestamps are untrustworthy", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "untrusted.csv", untrustedCsv(30))
  const region = bar(page)
  await expect(region.getByText("sample", { exact: true })).toBeVisible()
  await expect(region.getByText(/#\d+\s*\/\s*\d+/).first()).toBeVisible()
})

test("play/pause toggles and speed multiplier is selectable", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  const region = bar(page)
  const play = region.getByRole("button", { name: /Play playback|Pause playback/i })
  await play.click()
  await expect(play).toHaveAttribute("aria-pressed", "true")
  await play.click()
  await expect(play).toHaveAttribute("aria-pressed", "false")
  // Change playback speed via the dropdown.
  await region.getByRole("button", { name: /speed/i }).click()
  await page.getByRole("menuitemcheckbox", { name: "4×" }).click()
  await expect(region.getByRole("button", { name: /4× speed/i })).toBeVisible()
})

test("keyboard shortcuts control playback", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  const region = bar(page)
  const play = region.getByRole("button", { name: /Play playback|Pause playback/i })
  await page.locator("body").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Space")
  await expect(play).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Space")
  await expect(play).toHaveAttribute("aria-pressed", "false")
})
