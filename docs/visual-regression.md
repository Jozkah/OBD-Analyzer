# Visual regression

`e2e/visual.spec.ts` captures stable `toHaveScreenshot` baselines of the surfaces the visual
refinement changed. Because pixel snapshots are sensitive to the exact browser **and font stack**,
they are only ever generated and verified inside the **pinned Playwright container image**
(`mcr.microsoft.com/playwright:v1.49.1-jammy`) — never on a bare host, where font rasterisation would
differ from the committed baselines and produce false diffs.

## How it is wired

- The `visual` Playwright project exists **only when `VISUAL_ONLY=1`** (see `playwright.config.ts`).
  The normal `pnpm test:e2e` run therefore never touches it; the functional matrix (desktop / mobile /
  share-enabled) is unchanged.
- With `VISUAL_ONLY=1` the config also drops the sharing web server (not needed) and uses the
  container's own matching Chromium instead of the local `/opt` browser.
- Baselines live in `e2e/visual.spec.ts-snapshots/` with the `-visual-linux.png` suffix and are the
  only screenshots committed to the repo. Transient run output (`test-results/`,
  `playwright-report/`) is git-ignored.
- CI runs the suite in a dedicated `visual` job pinned to the same container image, and uploads the
  Playwright HTML report + `test-results/` (expected/actual/diff images) as the
  `playwright-visual-report` artifact so a reviewer can inspect any failure.

## Regenerate / add baselines

Start the production server on the host, then run the suite inside the container with the repo
mounted (reusing that server):

```bash
# 1. Build + serve the app on :3210
pnpm build && pnpm start &

# 2. (Re)generate baselines inside the pinned container
docker run --rm --network host --ipc=host \
  -v "$PWD":/work -w /work -e VISUAL_ONLY=1 -e HOME=/work -e CI= \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  npx playwright test --update-snapshots

# 3. Verify (no --update-snapshots); run twice to confirm stability
docker run --rm --network host --ipc=host \
  -v "$PWD":/work -w /work -e VISUAL_ONLY=1 -e HOME=/work -e CI= \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  npx playwright test
```

Review the regenerated PNGs before committing — a baseline change should reflect an intended visual
change, nothing more.
