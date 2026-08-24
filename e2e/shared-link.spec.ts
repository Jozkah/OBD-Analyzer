import { test, expect, type Page } from "@playwright/test"
import { trustedCsv } from "./helpers"

// Shared-link LOADING flow (?share=<id>). Runs only under the "share-enabled" project (sharing on).
// The GET /api/share/<id> endpoint is MOCKED — no live backend. Covers: the confirm prompt, a
// successful load, an expired/not-found link, a corrupt/failed payload, and — critically — that
// merely visiting a share link (or loading a log) never POSTs anything to /api/share on its own.

async function gotoShare(page: Page, id: string) {
  await page.goto(`/?share=${id}`)
}

async function failIfShareUpload(page: Page) {
  let posted = false
  await page.route("**/api/share", (route) => {
    if (route.request().method() === "POST") posted = true
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  })
  return () => posted
}

test("prompts, then loads a shared log via GET and shows the session", async ({ page }) => {
  const wasUploaded = await failIfShareUpload(page)
  await page.route("**/api/share/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csv: trustedCsv({ rows: 20 }), expiresAt: "2030-01-02T03:04:05.000Z" }),
    }),
  )

  await gotoShare(page, "abc123")

  // The trust prompt appears first — loading is user-confirmed, not automatic.
  const prompt = page.getByRole("dialog", { name: /Load shared log/i })
  await expect(prompt).toBeVisible()
  await prompt.getByRole("button", { name: /Load shared log/i }).click()

  // The CSV loads into a full session.
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
  // Loading a shared log must NOT push the log back to the server.
  expect(wasUploaded()).toBe(false)
})

test("reports an expired / not-found shared link", async ({ page }) => {
  await page.route("**/api/share/*", (route) => route.fulfill({ status: 404, body: "not found" }))

  await gotoShare(page, "gone")
  await page.getByRole("dialog", { name: /Load shared log/i }).getByRole("button", { name: /Load shared log/i }).click()

  await expect(page.getByRole("status").filter({ hasText: /expired or no longer exists/i }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Session Summary" })).toHaveCount(0)
})

test("reports a corrupt payload / server failure", async ({ page }) => {
  // 200 but the body isn't valid JSON → the client can't parse it.
  await page.route("**/api/share/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{not json" }),
  )

  await gotoShare(page, "corrupt")
  await page.getByRole("dialog", { name: /Load shared log/i }).getByRole("button", { name: /Load shared log/i }).click()

  await expect(page.getByRole("status").filter({ hasText: /couldn't load the shared log/i }).first()).toBeVisible()
})

test("dismissing the prompt loads nothing and never uploads", async ({ page }) => {
  const wasUploaded = await failIfShareUpload(page)
  let getCalled = false
  await page.route("**/api/share/*", (route) => {
    getCalled = true
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ csv: trustedCsv() }) })
  })

  await gotoShare(page, "abc123")
  await page.getByRole("dialog", { name: /Load shared log/i }).getByRole("button", { name: "Cancel", exact: true }).click()

  await expect(page.getByRole("dialog", { name: /Load shared log/i })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Session Summary" })).toHaveCount(0)
  expect(getCalled).toBe(false)
  expect(wasUploaded()).toBe(false)
})
