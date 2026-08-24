import { test, expect, type Page } from "@playwright/test"
import {
  uploadCsv, trustedCsv, partialCsv, stationaryGpsCsv, gotoSection, applyTheme,
} from "./helpers"

// §4 — REAL visual-regression coverage of the surfaces PR #93 changed, using stable toHaveScreenshot
// baselines. Deterministic built-in fixtures only; fonts + charts + map are allowed to settle; CSS
// animation is frozen at capture (see playwright.config `toHaveScreenshot`). This suite runs ONLY
// inside the pinned Playwright container (locally to author baselines and in CI to verify), so the
// browser + font stack is identical everywhere — see docs/visual-regression.md.
//
// Nothing here is masked: every fixture value, the offline map and the readouts are deterministic,
// so masking would only hide the very surfaces being audited.

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** Wait for fonts and (chart/map) paint to settle so the snapshot is stable. */
async function settle(page: Page, ms = 1800) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => undefined) : undefined))
  await page.waitForTimeout(ms)
}

async function load(page: Page, csv: string, theme: "light" | "dark", viewport = DESKTOP) {
  await page.setViewportSize(viewport)
  await page.goto("/")
  await applyTheme(page, theme)
  await uploadCsv(page, "vr.csv", csv)
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
}

// ---- Landing -------------------------------------------------------------------------------------
for (const theme of ["light", "dark"] as const) {
  test(`landing desktop ${theme}`, async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto("/")
    await applyTheme(page, theme)
    await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
    await settle(page, 400)
    await expect(page).toHaveScreenshot(`landing-desktop-${theme}.png`, { fullPage: true })
  })
}

test("landing mobile light", async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await page.goto("/")
  await applyTheme(page, "light")
  await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
  await settle(page, 400)
  await expect(page).toHaveScreenshot("landing-mobile-light.png", { fullPage: true })
})

// ---- Session Summary / dashboard -----------------------------------------------------------------
for (const theme of ["light", "dark"] as const) {
  test(`dashboard overview ${theme}`, async ({ page }) => {
    await load(page, trustedCsv({ rows: 40, gps: true }), theme)
    await settle(page)
    await expect(page).toHaveScreenshot(`dashboard-overview-${theme}.png`, { fullPage: true })
  })
}

// ---- Playback bar --------------------------------------------------------------------------------
test("playback bar with sample data", async ({ page }) => {
  await load(page, trustedCsv({ rows: 40, gps: true }), "dark")
  await settle(page, 600)
  const region = page.getByRole("region", { name: /Playback and time range/i })
  await expect(region).toHaveScreenshot("playback-bar-dark.png")
})

// ---- Performance workspace: populated + no-data --------------------------------------------------
test("performance workspace populated", async ({ page }) => {
  await load(page, trustedCsv({ rows: 60 }), "light")
  await gotoSection(page, /Perf/i)
  await expect(page.getByRole("heading", { name: /RPM vs Speed/i })).toBeVisible()
  await settle(page)
  await expect(page).toHaveScreenshot("performance-populated-light.png", { fullPage: true })
})

test("performance workspace missing required channels", async ({ page }) => {
  // partialCsv has only RPM + coolant → RPM/Speed, Throttle, Power/Torque charts show empty states.
  await page.setViewportSize(DESKTOP)
  await page.goto("/")
  await applyTheme(page, "light")
  await uploadCsv(page, "vr.csv", partialCsv(30))
  // Vehicle Speed is missing → dismiss the missing-channels dialog to enter the app.
  await page.getByRole("button", { name: /continue anyway/i }).click()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await gotoSection(page, /Perf/i)
  await expect(page.getByRole("heading", { name: /Throttle vs Speed/i })).toBeVisible()
  await settle(page)
  await expect(page).toHaveScreenshot("performance-empty-light.png", { fullPage: true })
})

// ---- Data Channels: no selection + multiple selected ---------------------------------------------
test("data channels no selection", async ({ page }) => {
  await load(page, trustedCsv({ rows: 40 }), "dark")
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
  await settle(page, 600)
  await expect(page).toHaveScreenshot("channels-empty-dark.png", { fullPage: true })
})

test("data channels multiple selected", async ({ page }) => {
  await load(page, trustedCsv({ rows: 40 }), "dark")
  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Inspect / }).nth(0).click()
  await settle(page)
  await expect(page).toHaveScreenshot("channels-selected-dark.png", { fullPage: true })
})

// ---- Route: stationary + moving ------------------------------------------------------------------
test("route stationary state", async ({ page }) => {
  await load(page, stationaryGpsCsv(30), "light")
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("img", { name: /stationary/i })).toBeVisible()
  await settle(page, 1200)
  await expect(page).toHaveScreenshot("route-stationary-light.png", { fullPage: true })
})

test("route moving track", async ({ page }) => {
  await load(page, trustedCsv({ rows: 60, gps: true }), "dark")
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("img", { name: /route map/i })).toBeVisible()
  await settle(page, 1200)
  await expect(page).toHaveScreenshot("route-moving-dark.png", { fullPage: true })
})

// ---- Transmission dialog: Manual + a secondary tab -----------------------------------------------
async function openTransmission(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Transmission/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
}

test("transmission dialog manual tab", async ({ page }) => {
  await load(page, trustedCsv({ rows: 40 }), "light")
  await openTransmission(page)
  await settle(page, 400)
  const dialog = page.getByRole("dialog", { name: /Transmission Configuration/i })
  await expect(dialog).toHaveScreenshot("transmission-manual-light.png")
})

test("transmission dialog presets tab", async ({ page }) => {
  await load(page, trustedCsv({ rows: 40 }), "light")
  await openTransmission(page)
  await page.getByRole("tab", { name: "Presets" }).click()
  await expect(page.getByRole("tab", { name: "Presets" })).toHaveAttribute("aria-selected", "true")
  await settle(page, 400)
  const dialog = page.getByRole("dialog", { name: /Transmission Configuration/i })
  await expect(dialog).toHaveScreenshot("transmission-presets-light.png")
})
