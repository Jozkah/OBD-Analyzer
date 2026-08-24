import { test, expect } from "@playwright/test"
import { uploadCsv, densePidsCsv, trustedCsv, gotoSection, expectNoPageOverflow } from "./helpers"

// §2 — the Data Channels table must never clip content silently. When it overflows horizontally it
// shows an honest scroll affordance (edge fade + hint) that appears only while there is more to
// scroll and disappears at the end; when it fits, no cue is shown. Long/near-duplicate PID names
// truncate visually but stay distinguishable via their accessible name/title. Runs desktop-only —
// it drives explicit viewport widths.

test("overflowing channel table shows a scroll cue that disappears at the end; last action reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "drives explicit viewport widths; run once on desktop")
  await page.goto("/")
  await uploadCsv(page, "dense.csv", densePidsCsv(400))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()

  // Narrow enough that the table's comfortable min-width exceeds the card → it must scroll.
  await page.setViewportSize({ width: 380, height: 820 })

  const scroller = page.getByTestId("channels-scroll")
  const endFade = page.getByTestId("channels-scroll-fade-end")
  const hint = page.getByTestId("channels-scroll-hint")

  // The container genuinely overflows horizontally...
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow, "table should overflow at 380px").toBeGreaterThan(1)

  // ...so the cue is shown and the right-edge fade is visible while more content lies to the right.
  await expect(hint).toBeVisible()
  await expect(endFade).toHaveCSS("opacity", "1")

  // The page itself never scrolls horizontally — the scroll is internal to the table.
  await expectNoPageOverflow(page, "channels overflow @380")

  // Scroll to the far right: the last (Actions) column becomes reachable and the end cue disappears.
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect(endFade).toHaveCSS("opacity", "0")
  const anAction = page.getByRole("button", { name: /Add .* to charts|Remove .* from charts|Pin|Unpin/ }).first()
  await expect(anAction).toBeVisible()
  await anAction.scrollIntoViewIfNeeded()
  await expect(anAction).toBeInViewport()

  // Near-duplicate PID names remain distinguishable through their accessible names (Bank 1 vs Bank 2).
  await expect(page.getByRole("button", { name: /Inspect .*Bank 1/i }).first()).toHaveCount(1)
  await expect(page.getByRole("button", { name: /Inspect .*Bank 2/i }).first()).toHaveCount(1)

  // Selecting + inspecting still works from the overflowing table.
  await page.getByRole("button", { name: /Inspect .*Bank 1/i }).first().click()
  await expect(page.getByRole("heading", { name: /Inspector/i })).toBeVisible()
  await expect(page.getByTestId(/^inspector-chart-/).first()).toBeVisible()
})

test("no scroll cue is shown when the channel table fits", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "drives explicit viewport widths; run once on desktop")
  await page.goto("/")
  await uploadCsv(page, "trusted.csv", trustedCsv({ rows: 30 }))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()

  // A roomy single-column width where the short-named table fits comfortably.
  await page.setViewportSize({ width: 1024, height: 900 })
  const scroller = page.getByTestId("channels-scroll")
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow, "table should fit at 1024px").toBeLessThanOrEqual(1)

  // No misleading cue: the hint is absent and the end fade is transparent.
  await expect(page.getByTestId("channels-scroll-hint")).toHaveCount(0)
  await expect(page.getByTestId("channels-scroll-fade-end")).toHaveCSS("opacity", "0")
})
