import { defineConfig, devices } from "@playwright/test"
import { existsSync } from "fs"

// In this dev environment a prebuilt Chromium lives under /opt/pw-browsers; point Playwright at it
// when present. In CI (and anywhere it's absent) fall back to Playwright's own installed browser
// (the workflow runs `playwright install --with-deps chromium`).
const LOCAL_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const executablePath = existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined
const isCI = !!process.env.CI
// Visual-regression baselines are pixel-sensitive to the browser + font stack, so they are ONLY
// generated and verified inside the pinned Playwright container image (see .github/workflows/ci.yml
// and docs/visual-regression.md). Setting VISUAL_ONLY skips the /opt override so the container's own
// matching Chromium is used, and drops the share webServer the visual suite doesn't need.
const visualOnly = !!process.env.VISUAL_ONLY

// Shared spec files that are neither share-enabled nor visual — the default functional matrix.
const FUNCTIONAL_IGNORE = ["**/share.spec.ts", "**/shared-link.spec.ts", "**/visual.spec.ts"]

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    // Tight but not brittle: the container guarantees an identical browser/font stack, so real
    // visual changes fail while sub-pixel noise is absorbed. `animations: disabled` freezes CSS
    // animation; `scale: css` keeps snapshots DPR-independent.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", scale: "css" },
  },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: executablePath && !visualOnly ? { executablePath } : {},
  },
  // When VISUAL_ONLY is set the ONLY project is the visual suite (run inside the pinned container so
  // the browser/font stack matches the committed baselines). Otherwise the functional matrix runs and
  // the visual suite is intentionally absent — it must never run on a mismatched (non-container) host,
  // where font rasterisation would differ from the baselines.
  projects: visualOnly
    ? [
        {
          name: "visual",
          testMatch: ["**/visual.spec.ts"],
          use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
        },
      ]
    : [
        // Default build ships with sharing OFF, so the share specs can't run here — they need a build
        // with NEXT_PUBLIC_SHARING_ENABLED=true (the "share-enabled" project below).
        {
          name: "desktop",
          testIgnore: FUNCTIONAL_IGNORE,
          use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
        },
        {
          name: "mobile",
          testIgnore: FUNCTIONAL_IGNORE,
          use: { ...devices["Pixel 5"] },
        },
        // Sharing turned ON via a dedicated dev server (env flag baked in at start), against a separate
        // output dir so it never collides with the production build the other projects serve.
        // /api/share is still mocked in the specs — no live backend dependency.
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
    // The sharing-enabled server is only needed by the share-enabled project; the visual suite skips
    // it (VISUAL_ONLY) so baseline runs don't pay for a second production build.
    ...(visualOnly
      ? []
      : [
          {
            // A REAL production build with sharing enabled, in an isolated output dir. Cross-platform
            // Node launcher (no shell env syntax) — see scripts/share-e2e-server.mjs. The build step
            // means this needs a longer readiness window than the pre-built disabled server above.
            command: "node scripts/share-e2e-server.mjs",
            url: "http://localhost:3211",
            reuseExistingServer: !isCI,
            timeout: 240_000,
          },
        ]),
  ],
})
