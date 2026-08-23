import { defineConfig, devices } from "@playwright/test"

// Use the Chromium pre-installed in the environment (revision may differ from the pinned
// @playwright/test version, so point directly at its binary).
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    trace: "off",
    launchOptions: { executablePath: CHROMIUM_PATH },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3210",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
