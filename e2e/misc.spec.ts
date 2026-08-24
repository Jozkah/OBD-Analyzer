import { test, expect } from "@playwright/test"
import { loadTrusted, uploadCsv, trustedCsv, primaryNav } from "./helpers"

test("collapsed desktop nav exposes accessible names", async ({ page, isMobile }) => {
  test.skip(isMobile, "collapsed rail is a desktop-only affordance")
  await loadTrusted(page, { rows: 20 })
  // Between md and xl the rail is icon-only (labels visually hidden) — names must remain.
  await page.setViewportSize({ width: 1024, height: 800 })
  const nav = primaryNav(page)
  for (const name of ["Session Summary", "Performance", "Engine", "Data Channels", "Route"]) {
    await expect(nav.getByRole("button", { name })).toBeVisible()
  }
  await expect(nav.getByRole("button", { name: /Settings/i })).toBeVisible()
})

test("handles a large log without crashing (spread/stack-overflow guard)", async ({ page }) => {
  await page.goto("/")
  // Large enough to exercise the analytics paths on a real render.
  await uploadCsv(page, "big.csv", trustedCsv({ rows: 20000 }))
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Data Health" })).toBeVisible()
})

test("does not surface the optional share action when sharing is disabled", async ({ page }) => {
  // Sharing is env-gated (NEXT_PUBLIC_SHARING_ENABLED) and off in this build.
  await loadTrusted(page, { rows: 20 })
  await page.getByRole("button", { name: "More actions" }).click()
  await expect(page.getByRole("menuitem", { name: /Share log/i })).toHaveCount(0)
})
