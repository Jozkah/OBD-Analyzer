import { test, expect, type Page } from "@playwright/test"
import { uploadCsv, trustedCsv } from "./helpers"

// §8 — responsive coverage of the EDGE STATES that the main overflow spec doesn't reach: the
// transmission dialog in each of its states, long channel names / many selected channels, and menus
// opened near a narrow viewport edge. The objective failures (horizontal page overflow, an action
// button pushed out of the viewport) are real assertions that FAIL CI — screenshots would only
// supplement them. Hover/drag aren't involved, but these drive modals/menus, so run desktop-only to
// avoid doubling the (already broad) matrix under the mobile device project.

const WIDTHS = [320, 375, 430, 768, 1024, 1440]
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

async function expectInViewport(page: Page, locator: ReturnType<Page["getByRole"]>, ctx: string) {
  await expect(locator, `${ctx}: not visible`).toBeVisible()
  const box = await locator.boundingBox()
  const innerW = await page.evaluate(() => window.innerWidth)
  const innerH = await page.evaluate(() => window.innerHeight)
  expect(box, `${ctx}: no box`).not.toBeNull()
  expect(box!.x, `${ctx}: off left`).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, `${ctx}: clipped right`).toBeLessThanOrEqual(innerW + 1)
  expect(box!.y + box!.height, `${ctx}: below fold / unreachable`).toBeLessThanOrEqual(innerH + 1)
}

async function openTransmission(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Transmission/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
}

// A log with many channels carrying long, wrap-prone names — the Channels explorer must not overflow.
function longNameCsv(rows = 40): string {
  const longCols = Array.from(
    { length: 16 },
    (_, i) => `Extremely Long Diagnostic Channel Name Number ${i + 1} With Units (units${i + 1})`,
  )
  const headers = ["Time", "Engine RPM (RPM)", "Vehicle speed (km/h)", "Absolute throttle position (%)", "Engine coolant temperature (°C)", ...longCols]
  const lines = [headers.join(",")]
  for (let i = 0; i < rows; i++) {
    const base = [new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(), 1000 + i * 100, i * 3, Math.min(100, i * 4), 85]
    lines.push([...base, ...longCols.map((_, c) => (i * (c + 1)) % 250)].join(","))
  }
  return lines.join("\n") + "\n"
}

for (const theme of THEMES) {
  test(`transmission dialog edge states never overflow or clip actions (${theme})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "modal-driven; run once on desktop across all widths")
    await page.goto("/")
    await uploadCsv(page, "qa.csv", trustedCsv({ rows: 30 }))
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
    await applyTheme(page, theme)

    const finalDrive = page.getByLabel("Final Drive Ratio")
    const apply = page.getByRole("button", { name: /Apply configuration/i })

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      await openTransmission(page)

      // Clean state — actions reachable, no overflow.
      await expectNoPageOverflow(page, `tx clean @${width} ${theme}`)
      await expectInViewport(page, page.getByRole("button", { name: "Cancel", exact: true }), `tx Cancel @${width}`)
      await expectInViewport(page, page.getByRole("button", { name: "Reset", exact: true }), `tx Reset @${width}`)

      // Dirty + invalid state (blank field → field error banner shown).
      await finalDrive.fill("")
      await apply.click()
      await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
      await expectNoPageOverflow(page, `tx invalid @${width} ${theme}`)

      // Reset confirmation.
      await page.getByRole("button", { name: "Reset", exact: true }).click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await expectNoPageOverflow(page, `tx reset-confirm @${width} ${theme}`)
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click()

      // Discard confirmation.
      await finalDrive.fill("6")
      await page.keyboard.press("Escape")
      await expect(page.getByRole("alertdialog").getByText(/discard unsaved changes/i)).toBeVisible()
      await expectNoPageOverflow(page, `tx discard-confirm @${width} ${theme}`)
      await page.getByRole("button", { name: /discard changes/i }).click()
      await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toHaveCount(0)
    }
  })
}

test("long channel names and many selected channels do not overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "runs once on desktop across all widths")
  await page.goto("/")
  await uploadCsv(page, "long.csv", longNameCsv(40))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()

  // Go to Channels and select many channels so the inspector grid is dense.
  const navs = page.getByRole("navigation", { name: "Primary" })
  const goChannels = async () => {
    const count = await navs.count()
    for (let i = 0; i < count; i++) {
      const nav = navs.nth(i)
      if (await nav.isVisible()) return nav.getByRole("button", { name: /Channels/i }).first().click()
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await goChannels()
  const adds = page.getByRole("button", { name: /^Inspect / })
  const toAdd = Math.min(8, await adds.count())
  for (let i = 0; i < toAdd; i++) await page.getByRole("button", { name: /^Inspect / }).first().click()

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await goChannels()
    await page.waitForTimeout(120)
    await expectNoPageOverflow(page, `channels many/long @${width}`)
  }
})

test("edge menus (More actions) open without pushing the page wider at 320px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "runs once on desktop")
  await page.goto("/")
  await uploadCsv(page, "qa.csv", trustedCsv({ rows: 20 }))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 800 })
  await page.getByRole("button", { name: "More actions" }).click()
  await expect(page.getByRole("menu")).toBeVisible()
  await expectNoPageOverflow(page, "more-actions menu @320")
})
