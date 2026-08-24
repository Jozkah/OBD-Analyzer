import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "fs"

// In this dev environment a prebuilt Chromium lives under /opt/pw-browsers; point Playwright at it
// when present. In CI (and anywhere it's absent) fall back to Playwright's own installed browser
// (the workflow runs `playwright install --with-deps chromium`).
const LOCAL_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const executablePath = existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined
const isCI = !!process.env.CI

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    // Default build ships with sharing OFF, so the share specs can't run here — they need a build
    // with NEXT_PUBLIC_SHARING_ENABLED=true (the "share-enabled" project below).
    {
      name: "desktop",
      testIgnore: ["**/share.spec.ts", "**/shared-link.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: ["**/share.spec.ts", "**/shared-link.spec.ts"],
      use: { ...devices["Pixel 5"] },
    },
    // Sharing turned ON via a dedicated dev server (env flag baked in at start), against a separate
    // output dir so it never collides with the production build the other projects serve. /api/share
    // is still mocked in the specs — no live backend dependency.
    {
      name: "share-enabled",
      testMatch: ["**/share.spec.ts", "**/shared-link.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:3211" },
    },
  ],
  webServer: [
    {
      command: "pnpm start",
      url: "http://localhost:3210",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "NEXT_PUBLIC_SHARING_ENABLED=true NEXT_DIST_DIR=.next-share pnpm exec next dev -p 3211",
      url: "http://localhost:3211",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
})
