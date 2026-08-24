import { test, expect, type Page } from "@playwright/test"
import { loadTrusted, gotoSection } from "./helpers"

// §4 — rendered proof that the synchronized inspector maps a position in the SLICED + DOWNSAMPLED
// chart back to the correct ORIGINAL log row, across two synced channels.
//
// The exact hover→original-row resolver (reading each retained point's preserved `originalIndex`,
// never the x value) is unit-tested against the real LTTB pipeline in lib/hover-map.test.ts —
// Recharts v3's pointer-driven tooltip can't be triggered by synthesized or OS pointer events under
// headless Playwright, so this spec drives the SAME synchronized inspector deterministically via the
// playback cursor instead: with a >500-row log narrowed to a window that starts well after row 0,
// both synced inspector charts must always resolve to the SAME original row and its raw values.
test.describe("rendered inspector → original-row synchronization", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop inspector layout")
  })

  const rpmAt = (i: number) => 1000 + i * 180
  const speedAt = (i: number) => i * 3
  const digits = (s: string) => Number(s.replace(/[^\d.-]/g, ""))

  async function readState(page: Page) {
    const texts = await page.locator('[data-testid^="inspector-value-"]').allTextContents()
    const nums = texts.map(digits).sort((a, b) => b - a) // [rpm, speed]
    const [rpm, speed] = nums
    return { rpm, speed, idxFromRpm: (rpm - 1000) / 180, idxFromSpeed: speed / 3 }
  }

  test("both synced inspector charts resolve to the same original row across a downsampled window", async ({ page }) => {
    await loadTrusted(page, { rows: 800 }) // > 500 → the chart series is downsampled
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

    // Park the cursor at the window end: both charts resolve to that exact ORIGINAL row (offset,
    // never row 0), and agree with each other.
    await page.locator("body").click({ position: { x: 5, y: 5 } })
    await page.keyboard.press("End")
    const hi = 799
    await expect.poll(async () => (await readState(page)).idxFromRpm).toBe(hi)
    {
      const s = await readState(page)
      expect(s.idxFromRpm).toBe(s.idxFromSpeed) // synchronized
      expect(s.rpm).toBe(rpmAt(hi))
      expect(s.speed).toBe(speedAt(hi))
      expect(s.idxFromRpm).toBeGreaterThanOrEqual(lo) // offset — not original row 0
    }

    // Step the cursor back by 5 samples: BOTH synced charts move to the same new original row.
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft")
    const target = hi - 5
    await expect.poll(async () => (await readState(page)).idxFromRpm).toBe(target)
    const s2 = await readState(page)
    expect(s2.idxFromRpm).toBe(s2.idxFromSpeed)
    expect(s2.rpm).toBe(rpmAt(target))
    expect(s2.speed).toBe(speedAt(target))
    expect(s2.idxFromRpm).toBeGreaterThanOrEqual(lo)
  })
})
