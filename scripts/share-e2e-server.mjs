// Portable launcher for the Playwright "share-enabled" project's web server.
//
// It builds and serves a REAL production build with NEXT_PUBLIC_SHARING_ENABLED baked in at build
// time, into an ISOLATED output directory (.next-share) so it can never overwrite or be reused by
// the normal sharing-disabled production build in .next. Cross-platform: no shell-specific env
// syntax — the env is set here and inherited by the child processes, and Windows gets shell:true so
// the pnpm/next shim resolves.
import { spawn } from "node:child_process"

const env = {
  ...process.env,
  NEXT_PUBLIC_SHARING_ENABLED: "true", // authoritative build-time flag (inlined into the bundle)
  NEXT_DIST_DIR: ".next-share", // isolated output dir (see next.config.mjs distDir)
}
const isWin = process.platform === "win32"

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", ...args], { env, stdio: "inherit", shell: isWin })
    child.on("error", reject)
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pnpm exec ${args.join(" ")} exited ${code}`))))
  })
}

// Build the sharing-enabled production bundle, then start it (long-running; Playwright waits on the
// port and tears this process down on teardown).
await run(["next", "build"])
await run(["next", "start", "-p", "3211"])
