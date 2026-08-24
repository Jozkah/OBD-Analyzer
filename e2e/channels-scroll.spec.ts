import { test, expect } from "@playwright/test"
import { uploadCsv, densePidsCsv, trustedCsv, gotoSection, expectNoPageOverflow } from "./helpers"

// §2 — the Data Channels table must never clip content silently. When it overflows horizontally it
// shows an honest, STATE-AWARE scroll cue: at the start it points right, in the middle it points
// both ways, and at the end it points back left (never implying more columns exist to the right when
// they don't). Each edge fade disappears at its own edge; both cues vanish when the table fits. Long
// /near-duplicate PID names truncate visually but stay distinguishable via their accessible
// name/title. Runs desktop-only — it drives explicit viewport widths.

test("channel-table scroll cue is state-aware across start → middle → end, and last action reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "drives explicit viewport widths; run once on desktop")
  await page.goto("/")
  await uploadCsv(page, "dense.csv", densePidsCsv(400))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()

  // Narrow enough that the table's comfortable min-width exceeds the card → it must scroll.
  await page.setViewportSize({ width: 380, height: 820 })

  const scroller = page.getByTestId("channels-scroll")
  const startFade = page.getByTestId("channels-scroll-fade-start")
  const endFade = page.getByTestId("channels-scroll-fade-end")
  const hint = page.getByTestId("channels-scroll-hint")

  // The container genuinely overflows horizontally.
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow, "table should overflow at 380px").toBeGreaterThan(1)

  // (1) At the initial LEFT edge: cue points right, only the right fade shows.
  await expect(hint).toHaveAttribute("data-cue-state", "right")
  await expect(hint).toContainText("Scroll right for more columns")
  await expect(endFade).toHaveCSS("opacity", "1")
  await expect(startFade).toHaveCSS("opacity", "0")
  await expectNoPageOverflow(page, "channels overflow @380 start")

  // (2) In the MIDDLE: cue points both ways, both fades show.
  await scroller.evaluate((el) => (el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2)))
  await expect(hint).toHaveAttribute("data-cue-state", "both")
  await expect(hint).toContainText("Scroll horizontally to view more columns")
  await expect(startFade).toHaveCSS("opacity", "1")
  await expect(endFade).toHaveCSS("opacity", "1")

  // (3) At the far-RIGHT edge: the cue no longer claims more columns to the right — it points left.
  await scroller.evaluate((el) => (el.scrollLeft = el.scrollWidth))
  await expect(hint).toHaveAttribute("data-cue-state", "left")
  await expect(hint).toContainText("Scroll left to view previous columns")
  await expect(hint).not.toContainText("Scroll right for more columns")
  // (4) Right fade absent at the far-right edge; (5) left fade still present.
  await expect(endFade).toHaveCSS("opacity", "0")
  await expect(startFade).toHaveCSS("opacity", "1")

  // The last (Actions) column is reachable once scrolled fully right.
  const anAction = page.getByRole("button", { name: /Add .* to charts|Remove .* from charts|Pin|Unpin/ }).first()
  await anAction.scrollIntoViewIfNeeded()
  await expect(anAction).toBeInViewport()

  // (7) The page itself never scrolls horizontally — the scroll is internal to the table.
  await expectNoPageOverflow(page, "channels overflow @380 end")

  // Near-duplicate PID names remain distinguishable through their accessible names (Bank 1 vs Bank 2).
  await expect(page.getByRole("button", { name: /Inspect .*Bank 1/i }).first()).toHaveCount(1)
  await expect(page.getByRole("button", { name: /Inspect .*Bank 2/i }).first()).toHaveCount(1)

  // Selecting + inspecting still works from the overflowing table.
  await page.getByRole("button", { name: /Inspect .*Bank 1/i }).first().click()
  await expect(page.getByRole("heading", { name: /Inspector/i })).toBeVisible()
  await expect(page.getByTestId(/^inspector-chart-/).first()).toBeVisible()
})

test("no cue and no fades are shown when the channel table fits", async ({ page }, testInfo) => {
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

  // (6) No misleading cue: the hint is absent and BOTH fades are transparent.
  await expect(page.getByTestId("channels-scroll-hint")).toHaveCount(0)
  await expect(page.getByTestId("channels-scroll-fade-start")).toHaveCSS("opacity", "0")
  await expect(page.getByTestId("channels-scroll-fade-end")).toHaveCSS("opacity", "0")
  await expectNoPageOverflow(page, "channels fit @1024")
})
