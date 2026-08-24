import { test, expect, type Page } from "@playwright/test"
import { loadTrusted, gotoSection } from "./helpers"

// §3 — GENUINE rendered hover: moves a real pointer over the Recharts SVG surface so Recharts fires
// its `onMouseMove`, which flows through the production handler → resolveHoverIndex() →
// setHoveredTimeKey() → the synchronized channel inspectors. Proves a hovered point in the SLICED +
// DOWNSAMPLED series resolves to the correct ORIGINAL log row (via its preserved `originalIndex`,
// never the array position, x value, or the unchanged playback cursor), and that BOTH synced charts
// move together. Runs on desktop only (the inspector is a desktop-width layout).
test.describe("rendered hover → original-row synchronization", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop inspector layout / pointer interaction")
  })

  const rpmAt = (i: number) => 1000 + i * 180
  const speedAt = (i: number) => i * 3
  const digits = (s: string) => Number(s.replace(/[^\d.-]/g, ""))

  // Read both synced inspector readouts → the original row each resolves to (RPM ≫ speed always).
  async function readState(page: Page) {
    const texts = await page.locator('[data-testid^="inspector-value-"]').allTextContents()
    const [rpm, speed] = texts.map(digits).sort((a, b) => b - a)
    return { rpm, speed, idxFromRpm: (rpm - 1000) / 180, idxFromSpeed: speed / 3 }
  }

  async function hoverFraction(page: Page, f: number) {
    const surface = page.locator('[data-testid^="inspector-chart-"]').first().locator(".recharts-surface").first()
    const box = (await surface.boundingBox())!
    const y = box.y + box.height * 0.5
    // A couple of stepped moves so Recharts registers the active point at this x.
    await page.mouse.move(box.x + box.width * (f + 0.06), y, { steps: 3 })
    await page.mouse.move(box.x + box.width * f, y, { steps: 3 })
  }

  test("hovering the chart resolves synced inspectors to the correct original row", async ({ page }) => {
    await loadTrusted(page, { rows: 800 }) // > 500 → the series is LTTB-downsampled
    await gotoSection(page, /Channels/i)

    // Select the first two channels (RPM then Speed).
    await page.getByRole("button", { name: /^Inspect / }).first().click()
    await page.getByRole("button", { name: /^Inspect / }).first().click()
    await expect(page.locator('[data-testid^="inspector-value-"]')).toHaveCount(2)

    // Narrow the analysis window so the visible data starts WELL after original row 0.
    const region = page.getByRole("region", { name: /Playback and time range/i })
    const start = region.locator('[aria-label="Analysis window start and end"]').getByRole("slider").nth(0)
    await start.focus()
    for (let i = 0; i < 60; i++) {
      if (Number(await start.getAttribute("aria-valuenow")) >= 200) break
      await page.keyboard.press("PageUp")
    }
    const lo = Number(await start.getAttribute("aria-valuenow"))
    expect(lo).toBeGreaterThanOrEqual(200)
    const hi = 799

    // Park the playback cursor on a deliberately DIFFERENT row (the window end).
    await page.locator("body").click({ position: { x: 5, y: 5 } })
    await page.keyboard.press("End")
    await expect.poll(async () => (await readState(page)).idxFromRpm).toBe(hi)

    // Hover an interior point on the LEFT of the plot → the inspectors leave the parked cursor and
    // resolve to an ORIGINAL row inside the window.
    await hoverFraction(page, 0.25)
    await expect.poll(async () => (await readState(page)).idxFromRpm, { timeout: 10_000 }).not.toBe(hi)
    const left = await readState(page)
    expect(Number.isInteger(left.idxFromRpm)).toBe(true)
    expect(left.idxFromRpm).toBe(left.idxFromSpeed) // both synced charts agree
    expect(left.rpm).toBe(rpmAt(left.idxFromRpm)) // resolved via originalIndex → raw row value
    expect(left.speed).toBe(speedAt(left.idxFromSpeed))
    expect(left.idxFromRpm).toBeGreaterThanOrEqual(lo) // offset — not original row 0
    expect(left.idxFromRpm).toBeLessThanOrEqual(hi)
    expect(left.idxFromRpm).not.toBe(hi) // not the parked cursor

    // Move to another retained point on the RIGHT → both synced readouts update together to a new,
    // later original row.
    await hoverFraction(page, 0.7)
    await expect.poll(async () => (await readState(page)).idxFromRpm).toBeGreaterThan(left.idxFromRpm)
    const right = await readState(page)
    expect(right.idxFromRpm).toBe(right.idxFromSpeed)
    expect(right.rpm).toBe(rpmAt(right.idxFromRpm))
    expect(right.idxFromRpm).toBeLessThanOrEqual(hi)

    // Leaving the chart returns the inspectors to the playback cursor value.
    await page.mouse.move(5, 5)
    await expect.poll(async () => (await readState(page)).idxFromRpm).toBe(hi)
  })
})
