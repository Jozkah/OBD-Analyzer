import { test, expect, type Page } from "@playwright/test"
import { loadTrusted } from "./helpers"

async function openTransmission(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Transmission/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toBeVisible()
}

const finalDrive = (page: Page) => page.getByLabel("Final Drive Ratio")

test("Apply commits the draft and it persists on reopen", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("5")
  await expect(page.getByText(/unsaved changes/i)).toBeVisible()
  await page.getByRole("button", { name: /Apply configuration/i }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toHaveCount(0)
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue("5")
})

test("Cancel discards the draft", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  const original = await finalDrive(page).inputValue()
  await finalDrive(page).fill("7")
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("dialog", { name: /Transmission Configuration/i })).toHaveCount(0)
  await openTransmission(page)
  await expect(finalDrive(page)).toHaveValue(original)
})

test("closing a dirty dialog asks before discarding", async ({ page }) => {
  await loadTrusted(page, { rows: 30 })
  await openTransmission(page)
  await finalDrive(page).fill("6")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("alertdialog").getByText(/discard unsaved changes/i)).toBeVisible()
  await page.getByRole("button", { name: /keep editing/i }).click()
  // Still open, edit preserved.
  await expect(finalDrive(page)).toHaveValue("6")
})
