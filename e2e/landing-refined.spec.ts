import { test, expect, type Page } from "@playwright/test"

// Visual-refinement guard for the landing/upload screen — the surface most changed by the
// restrained visual pass. The repo's convention is objective, CI-enforceable assertions
// (no horizontal overflow, key elements reachable) rather than fragile pixel snapshots, so
// this mirrors responsive-states.spec.ts for the pre-data upload screen it doesn't cover.

const WIDTHS = [320, 375, 768, 1024, 1440]
const THEMES = ["light", "dark"] as const

async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(t)
    try {
      localStorage.setItem("obd-theme", t)
    } catch {
      /* storage may be unavailable */
    }
  }, theme)
}

async function expectNoPageOverflow(page: Page, ctx: string) {
  const { scrollW, innerW } = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return { scrollW: el.scrollWidth, innerW: window.innerWidth }
  })
  expect(scrollW, `horizontal overflow ${ctx}: scrollWidth ${scrollW} > innerWidth ${innerW}`).toBeLessThanOrEqual(
    innerW + 1,
  )
}

test("refined landing page keeps its core affordances and never overflows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "runs once on desktop across all widths")
  await page.goto("/")

  // The refined hero: solid headline (with the single accent detail), both primary actions,
  // the supporting feature row, the supported-logger list and the softened privacy line.
  await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Choose CSV file/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Load sample data/i })).toBeVisible()
  await expect(page.getByText(/100% client-side/i)).toBeVisible()
  await expect(page.getByRole("heading", { name: /Private by default/i })).toBeVisible()
  await expect(page.getByText(/Car Scanner/i)).toBeVisible()

  for (const theme of THEMES) {
    await applyTheme(page, theme)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(80)
      await expectNoPageOverflow(page, `landing @${width} ${theme}`)
      // Both primary actions stay reachable within the viewport at every width.
      for (const box of [
        await page.getByRole("button", { name: /Choose CSV file/i }).boundingBox(),
        await page.getByRole("button", { name: /Load sample data/i }).boundingBox(),
      ]) {
        expect(box, `action has no box @${width} ${theme}`).not.toBeNull()
        expect(box!.x, `action off left @${width} ${theme}`).toBeGreaterThanOrEqual(-1)
        expect(box!.x + box!.width, `action clipped right @${width} ${theme}`).toBeLessThanOrEqual(width + 1)
      }
    }
  }
})
