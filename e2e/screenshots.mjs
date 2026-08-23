import { chromium } from "@playwright/test"

const OUT = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-OBD-Analyzer/35dcac91-8296-5bc2-babe-2992899930df/scratchpad/shots"
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const BASE = "http://localhost:3210"

const setTheme = async (page, theme) => {
  await page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(t)
    try { localStorage.setItem("obd-theme", t) } catch {}
  }, theme)
}

const loadSample = async (page) => {
  await page.goto(BASE)
  await page.getByRole("button", { name: /Load sample data/i }).first().click()
  await page.getByRole("heading", { name: "Session Summary" }).waitFor()
  await page.waitForTimeout(600)
}

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })

  // Desktop dark
  const d = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dp = await d.newPage()
  await dp.goto(BASE)
  await dp.waitForTimeout(400)
  await dp.screenshot({ path: `${OUT}/01-upload-dark.png` })
  await loadSample(dp)
  await dp.screenshot({ path: `${OUT}/02-overview-dark.png`, fullPage: true })
  await dp.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Channels/i }).click()
  await dp.waitForTimeout(500)
  await dp.screenshot({ path: `${OUT}/03-channels-dark.png` })
  await dp.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Perf/i }).click()
  await dp.waitForTimeout(700)
  await dp.screenshot({ path: `${OUT}/04-performance-dark.png` })

  // Desktop light overview
  await setTheme(dp, "light")
  await dp.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Summary/i }).click()
  await dp.waitForTimeout(500)
  await dp.screenshot({ path: `${OUT}/05-overview-light.png`, fullPage: true })
  await dp.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Perf/i }).click()
  await dp.waitForTimeout(700)
  await dp.screenshot({ path: `${OUT}/06-performance-light.png` })

  // Mobile
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const mp = await m.newPage()
  await loadSample(mp)
  await mp.screenshot({ path: `${OUT}/07-overview-mobile-dark.png`, fullPage: true })
  await mp.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Channels/i }).click()
  await mp.waitForTimeout(500)
  await mp.screenshot({ path: `${OUT}/08-channels-mobile-dark.png` })

  await browser.close()
  console.log("screenshots written to", OUT)
}

run().catch((e) => { console.error(e); process.exit(1) })
