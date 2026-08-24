import { test, expect, type Page } from "@playwright/test"
import { loadTrusted } from "./helpers"

// Enabled share flow. These specs run ONLY under the "share-enabled" Playwright project, whose dev
// server is started with NEXT_PUBLIC_SHARING_ENABLED=true — the same authoritative build-time flag a
// self-hoster would set. There is NO client-side override: the removed localStorage bypass must not
// come back. /api/share is MOCKED, so there's no live backend dependency; we drive the full flow and
// assert the request payload plus the success (link + expiry + copy) and failure branches.

async function openShare(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: /Share log/i }).click()
}

test("shares a log: sends the CSV, shows the link + expiry, and copies it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])

  const expiresAt = "2030-01-02T03:04:05.000Z"
  let postedBody: unknown = null
  await page.route("**/api/share", async (route) => {
    postedBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "test-share-id", expiresAt }),
    })
  })

  await loadTrusted(page, { rows: 20 })
  await openShare(page)

  // Success dialog with the built link and a human expiry.
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByText(/Shareable link created/i)).toBeVisible()
  const link = dialog.getByRole("textbox")
  await expect(link).toHaveValue(/\/\?share=test-share-id$/)
  await expect(dialog.getByText(/Anyone with this link can view this log until/i)).toBeVisible()

  // The request actually carried the log CSV.
  expect(postedBody).toBeTruthy()
  expect(typeof (postedBody as { csv?: string }).csv).toBe("string")
  expect((postedBody as { csv: string }).csv).toContain("Engine RPM")

  // Copy writes the link to the clipboard.
  await dialog.getByRole("button", { name: "Copy share link" }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toMatch(/\/\?share=test-share-id$/)
})

test("surfaces a friendly error when the share request fails", async ({ page }) => {
  await page.route("**/api/share", (route) => route.fulfill({ status: 500, body: "boom" }))

  await loadTrusted(page, { rows: 20 })
  await openShare(page)

  await expect(page.getByRole("status").filter({ hasText: /couldn't create a share link/i }).first()).toBeVisible()
  // No success dialog on failure.
  await expect(page.getByText(/Shareable link created/i)).toHaveCount(0)
})

test("reports when the instance has sharing unconfigured (501)", async ({ page }) => {
  await page.route("**/api/share", (route) => route.fulfill({ status: 501, body: "not configured" }))

  await loadTrusted(page, { rows: 20 })
  await openShare(page)

  await expect(page.getByRole("status").filter({ hasText: /isn't configured/i }).first()).toBeVisible()
})
