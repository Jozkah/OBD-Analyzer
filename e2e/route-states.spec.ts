import { test, expect, type Page } from "@playwright/test"
import {
  loadTrusted, uploadCsv, gotoSection, applyTheme, stationaryGpsCsv, sparseGpsCsv, trustedCsv,
} from "./helpers"

// §3 — the Route workspace must present each GPS shape deliberately: a normal moving track, a
// stationary/degenerate track (fixes exist but within ~20 m), sparse coverage, and no GPS at all.
// After the workspace settles there must be no lingering "Loading map…" impression, and the
// stationary/sparse states must read as designed states (theme-aware surfaces), not a bare message
// dropped onto a normal map.

async function openRoute(page: Page) {
  await gotoSection(page, /Route/i)
  await expect(page.getByRole("heading", { name: /Route/i }).first()).toBeVisible()
}

/** The map canvas has rendered (role=img with a descriptive name) → not the loading fallback. */
async function expectMapSettled(page: Page) {
  await expect(page.getByRole("img", { name: /GPS (route )?map/i })).toBeVisible()
  await expect(page.getByText("Loading map…")).toHaveCount(0)
}

for (const theme of ["light", "dark"] as const) {
  test(`valid moving route renders a track with no stationary/sparse notes (${theme})`, async ({ page }) => {
    await loadTrusted(page, { rows: 40, gps: true })
    await applyTheme(page, theme)
    await openRoute(page)
    await expectMapSettled(page)
    await expect(page.getByTestId("route-stationary-note")).toHaveCount(0)
    await expect(page.getByTestId("route-sparse-note")).toHaveCount(0)
    // A moving track exposes the keyboard-operable route map (not the stationary label).
    await expect(page.getByRole("img", { name: /route map/i })).toBeVisible()
  })

  test(`stationary GPS shows a deliberate no-track state that keeps fixes/speed/count (${theme})`, async ({ page }) => {
    await page.goto("/")
    await uploadCsv(page, "stationary.csv", stationaryGpsCsv(30))
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
    await applyTheme(page, theme)
    await openRoute(page)
    await expectMapSettled(page)

    // Deliberate workspace-level state + header badge, and the fix count stays available.
    const note = page.getByTestId("route-stationary-note")
    await expect(note).toBeVisible()
    await expect(note).toContainText(/no route to draw/i)
    await expect(note).toContainText(/30/)
    await expect(page.getByText("Stationary", { exact: true })).toBeVisible()
    await expect(page.getByText(/30\s+fixes/i)).toBeVisible()
    // The canvas explicitly reports the stationary condition (not a misleading normal-map label).
    await expect(page.getByRole("img", { name: /stationary/i })).toBeVisible()
    // Speed/location readout is still present for inspection.
    await expect(page.getByText(/Location|Speed/).first()).toBeVisible()
  })
}

test("sparse GPS shows a sparse-coverage note but still draws the track", async ({ page }) => {
  await page.goto("/")
  await uploadCsv(page, "sparse.csv", sparseGpsCsv(40, 10))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  await openRoute(page)
  await expectMapSettled(page)
  await expect(page.getByTestId("route-sparse-note")).toBeVisible()
  // The few fixes that exist span distance, so it is NOT flagged stationary.
  await expect(page.getByTestId("route-stationary-note")).toHaveCount(0)
})

test("no GPS data shows the dedicated empty state (no map, no loading)", async ({ page }) => {
  await loadTrusted(page, { rows: 30, gps: false })
  await openRoute(page)
  await expect(page.getByText(/No GPS data in this log/i)).toBeVisible()
  await expect(page.getByText("Loading map…")).toHaveCount(0)
})
