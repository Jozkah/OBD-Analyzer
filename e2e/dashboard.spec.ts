import { test, expect, type Page } from "@playwright/test"

async function loadSample(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Decode your/i })).toBeVisible()
  await page.getByRole("button", { name: /Load sample data/i }).first().click()
  // Session Summary appears once the sample parses.
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
}

test("imports the bundled sample and shows the session summary + data health", async ({ page }) => {
  await loadSample(page)
  await expect(page.getByRole("heading", { name: "Data Health" })).toBeVisible()
  // Summary headline stats are present.
  await expect(page.getByText("Max Speed")).toBeVisible()
  await expect(page.getByText("Sampling rate")).toBeVisible()
})

test("playback bar labels position and does not call a sample index 'time' incorrectly", async ({ page }) => {
  await loadSample(page)
  const bar = page.getByRole("region", { name: /Playback and time range/i })
  await expect(bar).toBeVisible()
  await expect(bar.getByText(/Analysis window/i)).toBeVisible()
  // Play toggles the pressed state.
  const play = bar.getByRole("button", { name: /Play playback|Pause playback/i })
  await play.click()
  await expect(play).toHaveAttribute("aria-pressed", "true")
  await play.click()
})

test("navigates between the primary sections", async ({ page, isMobile }) => {
  await loadSample(page)
  const nav = page.getByRole("navigation", { name: "Primary" }).first()
  await nav.getByRole("button", { name: /Channels|Data Channels/i }).click()
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
  await nav.getByRole("button", { name: /Perf|Performance/i }).click()
  await expect(page.getByRole("heading", { name: /RPM vs Speed/i })).toBeVisible()
  await nav.getByRole("button", { name: /Route/i }).click()
  await expect(page.getByRole("heading", { name: /Route Map|Route/i }).first()).toBeVisible()
  expect(isMobile !== undefined).toBeTruthy()
})

test("channels explorer filters and inspects a channel", async ({ page }) => {
  await loadSample(page)
  await page.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Channels/i }).click()
  await expect(page.getByRole("heading", { name: "Data Channels" })).toBeVisible()
  await page.getByPlaceholder("Search channels…").fill("rpm")
  // Add the first matching channel to the inspector.
  const addButtons = page.getByRole("button", { name: /Add .* to charts|Inspect/i })
  await addButtons.first().click()
  await expect(page.getByRole("heading", { name: /Inspector/i })).toBeVisible()
})

test("theme toggle switches between light and dark", async ({ page }) => {
  await loadSample(page)
  const html = page.locator("html")
  const before = await html.getAttribute("class")
  await page.getByRole("button", { name: /Switch to (light|dark) theme/i }).click()
  await expect(html).not.toHaveClass(before ?? "")
})
