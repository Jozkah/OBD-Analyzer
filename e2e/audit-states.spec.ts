import { test, expect, type Page } from "@playwright/test"
import {
  uploadCsv, trustedCsv, densePidsCsv, gotoSection, primaryNav,
  expectNoPageOverflow, expectInViewport, LONG_FILE_NAME,
} from "./helpers"

// §5 — objective coverage for the audit states PR #93 left unproven: 200%-zoom-equivalent layout
// pressure, reduced-motion usability, and a genuinely dense dataset (not the 38-row sample).

async function loadDashboard(page: Page, name: string, csv: string) {
  await page.goto("/")
  await uploadCsv(page, name, csv)
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
}

async function openTransmission(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Transmission/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
}

// ---- 200% zoom -----------------------------------------------------------------------------------
// Browser zoom can't be driven reliably through Playwright, so we reproduce the EQUIVALENT layout
// pressure per the audit: a halved CSS-pixel viewport (a 1440/1024 screen at 200% zoom presents
// 720/512 CSS px) combined with an enlarged root font so text reflow is also exercised. Documented
// here rather than claiming an unexecuted native-zoom test.
const ZOOM_CASES = [
  { w: 720, h: 640, label: "1440 @200%" },
  { w: 512, h: 700, label: "1024 @200%" },
]

for (const zc of ZOOM_CASES) {
  test(`200%-zoom-equivalent (${zc.label}) stays usable with no page overflow`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "drives explicit viewport widths; run once on desktop")
    await page.setViewportSize({ width: zc.w, height: zc.h })
    await loadDashboard(page, "zoom.csv", trustedCsv({ rows: 30, gps: true }))
    // Increase text/layout pressure to approximate the enlarged glyphs of real zoom.
    await page.evaluate(() => (document.documentElement.style.fontSize = "20px"))

    // Overview: readable summary, usable playback, reachable navigation, no page overflow.
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
    const region = page.getByRole("region", { name: /Playback and time range/i })
    await expectInViewport(page, region.getByRole("button", { name: /Play playback|Pause playback/i }), `play @${zc.label}`)
    // Navigation is reachable (the active nav — sidebar or bottom bar depending on width).
    await expect(primaryNav(page)).toBeVisible()
    await expect(primaryNav(page).getByRole("button", { name: /Perf/i })).toBeVisible()
    await expectNoPageOverflow(page, `overview @${zc.label}`)

    // Data Channels: an add/inspect action stays reachable.
    await gotoSection(page, /Channels/i)
    await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
    await expectNoPageOverflow(page, `channels @${zc.label}`)
    const action = page.getByRole("button", { name: /Inspect /i }).first()
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeVisible()

    // Transmission dialog: tabs and footer actions usable, no overflow.
    await gotoSection(page, /Summary/i)
    await openTransmission(page)
    await expectNoPageOverflow(page, `tx @${zc.label}`)
    await expect(page.getByRole("tab", { name: "Manual" })).toBeVisible()
    await page.getByRole("tab", { name: "Presets" }).click()
    await expect(page.getByRole("tab", { name: "Presets" })).toHaveAttribute("aria-selected", "true")
    await expectInViewport(page, page.getByRole("button", { name: /Apply configuration/i }), `tx Apply @${zc.label}`)
    await expectInViewport(page, page.getByRole("button", { name: "Cancel", exact: true }), `tx Cancel @${zc.label}`)
  })
}

// ---- Reduced motion ------------------------------------------------------------------------------
test.describe("prefers-reduced-motion: reduce", () => {
  test("app is fully usable and content is visible without motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    // Landing page renders its primary actions immediately.
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Choose CSV file/i })).toBeVisible()

    await uploadCsv(page, "rm.csv", trustedCsv({ rows: 30, gps: true }))
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()

    // Navigation change reveals the workspace content instantly (no animation gate).
    await gotoSection(page, /Perf/i)
    await expect(page.getByRole("heading", { name: /RPM vs Speed/i })).toBeVisible()
    await expect(page.locator(".recharts-surface").first()).toBeVisible()

    // Press feedback control still works; dialog opens and its content is visible.
    await gotoSection(page, /Summary/i)
    await openTransmission(page)
    await expect(page.getByRole("tab", { name: "Manual" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Apply configuration/i })).toBeVisible()
  })
})

// ---- Dense, long, near-duplicate data ------------------------------------------------------------
test("dense dataset with long/near-duplicate PID names and a long filename", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "drives explicit viewport widths; run once on desktop")
  await loadDashboard(page, LONG_FILE_NAME, densePidsCsv(1500))

  // Long filename never breaks the header layout.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expectNoPageOverflow(page, "dense header @1440")

  await gotoSection(page, /Channels/i)
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()

  // Many channels present; near-duplicate names distinguishable via accessible name.
  const inspectButtons = page.getByRole("button", { name: /^Inspect / })
  expect(await inspectButtons.count()).toBeGreaterThan(10)
  await expect(page.getByRole("button", { name: /Inspect .*Bank 1/i }).first()).toHaveCount(1)
  await expect(page.getByRole("button", { name: /Inspect .*Bank 2/i }).first()).toHaveCount(1)

  // Select several channels → the inspector renders one chart each.
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^Inspect / }).nth(0).click()
  expect(await page.getByTestId(/^inspector-chart-/).count()).toBeGreaterThanOrEqual(4)

  // No page overflow at desktop or a narrow width with the dense table.
  await expectNoPageOverflow(page, "dense channels @1440")
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoPageOverflow(page, "dense channels @390")
})
