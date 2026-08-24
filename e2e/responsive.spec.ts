import { test, expect, type Page } from "@playwright/test"
import { uploadCsv, trustedCsv } from "./helpers"

// CI-enforced responsive QA: the layout must never overflow horizontally at any supported width in
// either theme. This replaces the old one-off e2e/visual-qa.mjs script (hardcoded local paths) with
// a real spec so a regression FAILS the build instead of needing a manual eyeball.

const WIDTHS = [320, 375, 430, 768, 1024, 1440]
// Regexes that match BOTH nav variants (side rail uses full labels, bottom bar uses short ones:
// "Performance"/"Perf", "Session Summary"/"Summary", "Data Channels"/"Channels").
const SECTIONS = [/Summary/i, /Perf/i, /Engine/i, /Channels/i, /Route/i]

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

// The app renders two navs both labelled "Primary" — a side rail (≥768px) and a bottom bar
// (<768px) — with only one visible at a time. Click the button in whichever is currently shown.
async function goSection(page: Page, name: RegExp) {
  const navs = page.getByRole("navigation", { name: "Primary" })
  const count = await navs.count()
  for (let i = 0; i < count; i++) {
    const nav = navs.nth(i)
    if (await nav.isVisible()) {
      await nav.getByRole("button", { name }).first().click()
      return
    }
  }
  throw new Error(`No visible Primary nav to select ${name}`)
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return { scrollW: el.scrollWidth, innerW: window.innerWidth }
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`no horizontal overflow at any width (${theme})`, async ({ page }) => {
    await page.goto("/")
    await uploadCsv(page, "qa.csv", trustedCsv({ rows: 60, gps: true }))
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
    await applyTheme(page, theme)

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 860 })
      for (const section of SECTIONS) {
        await goSection(page, section)
        // Let layout settle (charts/canvas reflow) before measuring.
        await page.waitForTimeout(150)
        const { scrollW, innerW } = await horizontalOverflow(page)
        expect(
          scrollW,
          `horizontal overflow at ${width}px (${theme}) on ${section}: scrollWidth ${scrollW} > innerWidth ${innerW}`,
        ).toBeLessThanOrEqual(innerW + 1)
      }
    }
  })
}
