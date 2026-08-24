import { test, expect } from "@playwright/test"
import { loadTrusted, gotoSection, primaryNav } from "./helpers"

// Motion / UI-rework pass. Covers the new command channel finder, the animated summary values, the
// reworked toast, section navigation, and — importantly — that reduced motion never hides content.
// These assert BEHAVIOUR and presence, not exact animation frames, so they're stable in CI.

test.describe("reduced motion", () => {
  test("content is fully visible and navigable with reduced motion", async ({ page }) => {
    // Emulate the OS "reduce motion" setting; MotionConfig reducedMotion="user" + the globals.css
    // media query then strip movement while keeping content immediately visible.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await loadTrusted(page, { rows: 40 })
    // Session summary + its animated values are present (not stuck at an initial hidden/zero state).
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
    await expect(page.getByText("Max Speed")).toBeVisible()
    // rows=40 → max speed = 39*3 = 117; the value must be present (not hidden/zero) under reduced motion.
    await expect(page.getByText("117.00").first()).toBeVisible()
    // Section switching still swaps content with motion disabled.
    // Nav labels differ by breakpoint (bottom-nav uses short labels): /Channels/ and /Summary/ match both.
    await gotoSection(page, /Channels/i)
    await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
    await gotoSection(page, /Summary/i)
    await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  })
})

test("animated summary values settle on the correct formatted number", async ({ page }) => {
  // Default trusted log: speed = i*3 over 30 rows → max speed 87. The count-up must land on 87.00.
  await loadTrusted(page)
  await expect(page.getByText("87.00").first()).toBeVisible()
})

test.describe("command channel finder", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "keyboard-nav + focus-restore is exercised on desktop")
  })

  test("keyboard toggles a channel, Escape closes and restores focus", async ({ page }) => {
    await loadTrusted(page, { rows: 60 })
    const trigger = page.getByRole("button", { name: /Find channels/i })
    await trigger.click()

    const dialog = page.getByRole("dialog", { name: /Find channels/i })
    await expect(dialog).toBeVisible()

    const footer = dialog.getByText(/selected · \d+ shown/i)
    const selectedOf = async () => Number((await footer.textContent())!.match(/(\d+) selected/)![1])
    const before = await selectedOf()

    // Move the highlight and toggle the first result from the search box.
    await page.getByRole("textbox", { name: /Search channels/i }).fill("")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect.poll(selectedOf).not.toBe(before)

    // Escape closes the dialog and returns focus to the button that opened it.
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("search narrows the result list", async ({ page }) => {
    await loadTrusted(page, { rows: 40 })
    await page.getByRole("button", { name: /Find channels/i }).click()
    const dialog = page.getByRole("dialog", { name: /Find channels/i })
    const options = dialog.getByRole("option")
    const all = await options.count()
    await page.getByRole("textbox", { name: /Search channels/i }).fill("rpm")
    await expect.poll(async () => await options.count()).toBeLessThanOrEqual(all)
    await expect(options.first()).toContainText(/rpm/i)
  })
})

test("toast can be dismissed manually", async ({ page }) => {
  await loadTrusted(page, { rows: 20 })
  // Export the window → a success toast with a dismiss button.
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Export window as CSV/i }).click()
  const toast = page.getByRole("status").filter({ hasText: /Exported the current window/i })
  await expect(toast).toBeVisible()
  await toast.getByRole("button", { name: /Dismiss notification/i }).click()
  await expect(toast).toBeHidden()
})

test("active section indicator is present in the primary nav", async ({ page }) => {
  await loadTrusted(page, { rows: 20 })
  // aria-current marks the active destination regardless of the (motion) highlight.
  // /Perf/ matches both the desktop "Performance" and the mobile "Perf" labels.
  await gotoSection(page, /Perf/i)
  await expect(primaryNav(page).getByRole("button", { name: /Perf/i })).toHaveAttribute("aria-current", "page")
})
