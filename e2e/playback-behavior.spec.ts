import { test, expect, type Page } from "@playwright/test"
import { uploadCsv, untrustedCsv } from "./helpers"

// Behavioral playback tests. Playwright's fake clock (page.clock) drives performance.now() and
// requestAnimationFrame deterministically, so we can advance virtual wall-clock time by an exact
// amount and assert the EXACT sample the playhead lands on — proving the real-elapsed-time mapping,
// the gap cap, the untrusted-cadence fallback, and pause/resume/seek/rewind behaviour, rather than
// just that a button toggles.

const REQUIRED = ["Time", "Engine RPM (RPM)", "Vehicle speed (km/h)", "Absolute throttle position (%)", "Engine coolant temperature (°C)"]

/** Build a trusted CSV whose per-sample ISO timestamps come from an explicit elapsed-seconds list. */
function csvFromElapsed(elapsedSec: number[]): string {
  const base = Date.UTC(2024, 0, 1, 0, 0, 0)
  const lines = [REQUIRED.join(",")]
  elapsedSec.forEach((s, i) => {
    const t = new Date(base + Math.round(s * 1000)).toISOString()
    lines.push([t, 1000 + i * 100, i * 3, Math.min(100, i * 4), 85].join(","))
  })
  return lines.join("\n") + "\n"
}

/** Evenly-spaced trusted CSV (1 s per sample). */
function regularCsv(rows: number): string {
  return csvFromElapsed(Array.from({ length: rows }, (_, i) => i))
}

function bar(page: Page) {
  return page.getByRole("region", { name: /Playback and time range/i })
}
function playhead(page: Page) {
  // The aria-label sits on the slider root; the thumb (role=slider, carrying aria-valuenow) is its
  // descendant.
  return bar(page).locator('[aria-label="Playback position"]').getByRole("slider")
}
function playButton(page: Page) {
  return bar(page).getByRole("button", { name: /Play playback|Pause playback/i })
}
async function setRate(page: Page, rate: number) {
  await bar(page).getByRole("button", { name: /speed$/i }).click()
  await page.getByRole("menuitemcheckbox", { name: `${rate}×`, exact: true }).click()
}
async function loadWithClock(page: Page, csv: string) {
  await page.clock.install()
  await page.goto("/")
  await uploadCsv(page, "log.csv", csv)
  await expect(page.getByRole("heading", { name: "Session Summary" })).toBeVisible()
}
const at = (page: Page, index: number) => expect(playhead(page)).toHaveAttribute("aria-valuenow", String(index))

// --- Rate scaling: index = floor(realSeconds × rate) on a 1 s/sample log ---
for (const { rate, ms, expected } of [
  { rate: 0.5, ms: 4200, expected: 2 },
  { rate: 1, ms: 3200, expected: 3 },
  { rate: 2, ms: 3100, expected: 6 },
  { rate: 4, ms: 2100, expected: 8 },
]) {
  test(`plays at ${rate}× real time`, async ({ page }) => {
    await loadWithClock(page, regularCsv(60))
    await at(page, 0)
    if (rate !== 1) await setRate(page, rate)
    await playButton(page).click()
    await page.clock.runFor(ms)
    await at(page, expected)
  })
}

test("irregular sampling plays at each sample's true pace", async ({ page }) => {
  // First 8 samples are 0.25 s apart, so 1.1 s of playback at 1× crosses four of them (not one).
  const dense = Array.from({ length: 8 }, (_, i) => i * 0.25) // 0,0.25,…,1.75
  const rest = Array.from({ length: 12 }, (_, i) => 2 + i) // then 1 s spacing
  await loadWithClock(page, csvFromElapsed([...dense, ...rest]))
  await playButton(page).click()
  await page.clock.runFor(1100)
  await at(page, 4)
})

test("duplicate timestamps are stepped through immediately", async ({ page }) => {
  // Three identical timestamps at the start: the two zero-length steps cost no virtual time.
  await loadWithClock(page, csvFromElapsed([0, 0, 0, 1, 2, 3, 4, 5]))
  await playButton(page).click()
  await page.clock.runFor(100) // only 0.1 s of budget…
  await at(page, 2) // …yet both duplicate steps are consumed
})

test("a long recording gap is capped, not waited out", async ({ page }) => {
  // A 100 s gap between samples 2 and 3 is capped to MAX_GAP_SECONDS (2 s) for stepping.
  await loadWithClock(page, csvFromElapsed([0, 1, 2, 102, 103, 104, 105]))
  await playButton(page).click()
  await page.clock.runFor(4300) // 4.3 s: 1+1+2(capped)=4 s reaches sample 3
  await at(page, 3) // uncapped this would need 102 s
})

test("untrusted timestamps fall back to a fixed sample cadence", async ({ page }) => {
  await loadWithClock(page, untrustedCsv(60))
  await expect(bar(page).getByText("sample", { exact: true })).toBeVisible()
  await playButton(page).click()
  await page.clock.runFor(1050) // 10 Hz fallback → 10 samples in ~1 s
  await at(page, 10)
})

test("pause freezes the cursor; resume continues from there", async ({ page }) => {
  await loadWithClock(page, regularCsv(60))
  await playButton(page).click()
  await page.clock.runFor(2100)
  await at(page, 2)
  await playButton(page).click() // pause
  await expect(playButton(page)).toHaveAttribute("aria-pressed", "false")
  await page.clock.runFor(5000) // time passes while paused…
  await at(page, 2) // …cursor does not move
  await playButton(page).click() // resume
  await page.clock.runFor(1200)
  await at(page, 3)
})

test("seeking moves the cursor and playback resumes from the new position", async ({ page }) => {
  await loadWithClock(page, regularCsv(60))
  const head = playhead(page)
  await head.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight")
  await at(page, 5)
  await playButton(page).click()
  await page.clock.runFor(2100)
  await at(page, 7)
})

test("reaching the window end stops playback and rewinds to the start", async ({ page }) => {
  await loadWithClock(page, regularCsv(20))
  await setRate(page, 4)
  await playButton(page).click()
  await page.clock.runFor(6000) // 24 virtual s ≫ the 19 s window
  await at(page, 0) // rewound to the start
  await expect(playButton(page)).toHaveAttribute("aria-pressed", "false")
})

test("Space toggles playback and advances real time", async ({ page }) => {
  await loadWithClock(page, regularCsv(60))
  await page.locator("body").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("Space")
  await expect(playButton(page)).toHaveAttribute("aria-pressed", "true")
  await page.clock.runFor(2100)
  await at(page, 2)
  await page.keyboard.press("Space")
  await expect(playButton(page)).toHaveAttribute("aria-pressed", "false")
})
