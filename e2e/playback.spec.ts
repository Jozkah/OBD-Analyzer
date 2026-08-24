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

test("play/pause stays the primary control in both idle and playing states", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  const region = bar(page)
  const play = region.getByRole("button", { name: /Play playback|Pause playback/i })
  // Idle: it's the primary control (primary variant paints bg-primary). Substring match, not
  // class-order dependent.
  await expect(play).toHaveAttribute("aria-pressed", "false")
  await expect(play).toHaveClass(/bg-primary/)
  // While playing: still the SAME element (data-playing flips) and still primary — the control
  // never drops its emphasis mid-session.
  await play.click()
  await expect(play).toHaveAttribute("aria-pressed", "true")
  await expect(play).toHaveAttribute("data-playing", "true")
  await expect(play).toHaveClass(/bg-primary/)
  await play.click()
  await expect(play).toHaveAttribute("aria-pressed", "false")
  await expect(play).toHaveAttribute("data-playing", "false")
  await expect(play).toHaveClass(/bg-primary/)
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

test("shift indicator is exposed as a semantic, named element", async ({ page }) => {
  await loadTrusted(page, { rows: 40 })
  const region = bar(page)
  // Jump to a fast sample so a gear (and therefore a recommendation) is available.
  await region.getByRole("button", { name: "Jump to end" }).click()
  // Not a bare span/title: it's an image-role node with a descriptive accessible name, and it
  // carries a visible text label (never colour/icon alone).
  const badge = region.getByRole("img", { name: /Shift recommendation:/i })
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText(/Upshift|Downshift|Optimal/)
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
