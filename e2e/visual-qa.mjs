import { chromium } from "@playwright/test"

const OUT = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-OBD-Analyzer/35dcac91-8296-5bc2-babe-2992899930df/scratchpad/qa"
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const BASE = "http://localhost:3210"
const WIDTHS = [320, 375, 430, 768, 1024, 1440]

const csv = () => {
  const h = "Time,Engine RPM (RPM),Vehicle speed (km/h),Absolute throttle position (%),Engine coolant temperature (°C),Latitude (deg),Longitude (deg)"
  const rows = [h]
  for (let i = 0; i < 60; i++) {
    const t = new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString()
    rows.push(`${t},${1000 + i * 90},${i * 2},${Math.min(100, i * 3)},${80 + Math.min(20, i)},${(51.5 + i * 0.0004).toFixed(5)},${(-0.1 - i * 0.0004).toFixed(5)}`)
  }
  return rows.join("\n") + "\n"
}

const setTheme = (page, theme) =>
  page.evaluate((t) => {
    document.documentElement.classList.remove("light", "dark")
    document.documentElement.classList.add(t)
    try { localStorage.setItem("obd-theme", t) } catch {}
  }, theme)

const overflow = (page) =>
  page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement
    return { scrollW: el.scrollWidth, innerW: window.innerWidth, overflow: el.scrollWidth > window.innerWidth + 1 }
  })

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE })
  const findings = []
  for (const width of WIDTHS) {
    for (const theme of ["dark", "light"]) {
      const ctx = await browser.newContext({ viewport: { width, height: 860 }, isMobile: width <= 430, hasTouch: width <= 430, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.goto(BASE)
      await setTheme(page, theme)
      await page.reload()
      await setTheme(page, theme)
      await page.locator('input[type="file"]').setInputFiles({ name: "qa.csv", mimeType: "text/csv", buffer: Buffer.from(csv()) })
      await page.getByRole("heading", { name: "Session Summary" }).waitFor({ timeout: 15000 })
      await page.waitForTimeout(400)
      const sections = ["Summary", "Perf", "Engine", "Channels", "Route"]
      for (const s of sections) {
        const btn = page.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: new RegExp(s, "i") })
        await btn.click().catch(() => {})
        await page.waitForTimeout(300)
        const o = await overflow(page)
        if (o.overflow) findings.push(`OVERFLOW ${width}px ${theme} @${s}: scrollW=${o.scrollW} innerW=${o.innerW}`)
      }
      // Screenshot the overview for the record.
      await page.getByRole("navigation", { name: "Primary" }).first().getByRole("button", { name: /Summary/i }).click().catch(() => {})
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/overview-${width}-${theme}.png`, fullPage: false })
      await ctx.close()
    }
  }
  console.log(findings.length ? findings.join("\n") : "NO HORIZONTAL OVERFLOW at any breakpoint/theme")
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
