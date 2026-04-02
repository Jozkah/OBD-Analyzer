# OBD Data Analyzer — Master Task Tracker

> Generated: April 2, 2026
> Purpose: Single source of truth for all planned improvements and feature requests with implementation status

---

## Legend

- ✅ **Done** — Implemented and verified
- 🔲 **Not started** — Planned but not yet implemented

---

## User-Requested Features

| # | Feature | Status | Details |
|---|---|---|---|
| F1 | **Multi-CSV Import & Merge** | ✅ Done | Select/drop multiple `.csv` files; auto-orders by filename sequence, `lastModified`, or alphabetical; merges into single dataset. UI shows merged file count and ordered filenames. |
| F2 | **Ignore Idle Checkbox** | ✅ Done | "Ignore Idle" checkbox in control bar excludes `speed === 0` data points from all statistics/averages. Charts still display idle data. |

---

## Improvement Plan (23 Points)

### Phase 1 — Cleanup & Hygiene

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Delete 12 dead component files | 🔲 Not started | `components/button.tsx`, `card.tsx`, `checkbox.tsx`, `slider.tsx`, `tabs.tsx`, `dashboard.tsx`, `data-table.tsx`, `file-upload.tsx`, `metric-chart.tsx`, `metric-selector.tsx`, `theme-provider.tsx`, `track-map.tsx` |
| 2 | Delete dead `styles/globals.css` | 🔲 Not started | Duplicate of `app/globals.css` with different CSS variable values; never imported |
| 3 | Remove ~20 unused dependencies from `package.json` | 🔲 Not started | `react-dropzone`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `vaul`, `cmdk`, `input-otp`, `geist`, `embla-carousel-react`, `react-resizable-panels`, `react-day-picker`, ~10 unused Radix packages |
| 4 | Pin all `"latest"` versions to exact versions | 🔲 Not started | 20+ deps use `"latest"`; extract real versions from `pnpm-lock.yaml` |
| 5 | Remove fake brake data generation (`Math.random()`) | 🔲 Not started | Line ~1159: random noise injected when brake data is missing |
| 6 | Remove unused module-level constants | 🔲 Not started | `GEAR_RATIOS`, `FINAL_DRIVE`, `TYRE_DIAMETER_MM`, `TYRE_CIRCUMFERENCE`, `SHIFT_RPM` — never referenced |
| 7 | Remove Leaflet CSS from `app/globals.css` | 🔲 Not started | Lines ~87–113: Leaflet styles present but app uses canvas-based map |

### Phase 2 — Re-enable Safety Nets

| # | Task | Status | Notes |
|---|---|---|---|
| 8 | Remove `ignoreBuildErrors: true` for TypeScript | 🔲 Not started | In `next.config.mjs` — suppresses all TS errors at build time |
| 9 | Remove `ignoreDuringBuilds: true` for ESLint | 🔲 Not started | In `next.config.mjs` — suppresses all lint errors at build time |
| 10 | Fix type errors that surface | 🔲 Not started | Expected: `onCheckedChange` type mismatch, `any` return types, etc. |
| 11 | Add proper TypeScript interfaces (replace `any`) | 🔲 Not started | `TransmissionConfig`, `GearDetectionResult`, gear-related function params |

### Phase 3 — Decompose God Component

| # | Task | Status | Notes |
|---|---|---|---|
| 12 | Extract utility modules | 🔲 Not started | `lib/csv-parser.ts`, `lib/gear-calculator.ts`, `lib/formatters.ts`, `lib/constants.ts`, `lib/types.ts` |
| 13 | Extract shared UI components | 🔲 Not started | `metrics-sidebar.tsx` (duplicated), `gps-track-map.tsx`, `transmission-dialog.tsx`, `session-stats.tsx`, `missing-pids-dialog.tsx` |
| 14 | Extract tab content into separate components | 🔲 Not started | One component per tab: overview, performance, engine, pid-analysis, gps |

### Phase 4 — Correctness & Robustness

| # | Task | Status | Notes |
|---|---|---|---|
| 15 | Use PapaParse for CSV parsing | 🔲 Not started | Already installed; replaces manual `.split(",")` which breaks on quoted commas |
| 16 | Replace `Math.max(...array)` with safe reduce | 🔲 Not started | Prevents `RangeError` on datasets >100k points |
| 17 | Add React error boundary | 🔲 Not started | Wrap chart/canvas rendering to prevent white screen crashes |
| 18 | Add missing `satellite-texture.png` or remove reference | 🔲 Not started | `GPSTrackMap` references `/images/satellite-texture.png` which doesn't exist |
| 19 | Fix regex in `shortenColumnName` | 🔲 Not started | `$$[^)]*$$` matches dollar signs instead of parentheses |

### Phase 5 — UX & Accessibility

| # | Task | Status | Notes |
|---|---|---|---|
| 20 | Make tabs 3–5 accessible on mobile | 🔲 Not started | Engine, PID Analysis, GPS are `hidden md:block` — unreachable on phones |
| 21 | Implement proper theme switching | 🔲 Not started | Replace hardcoded `className="dark"` with `ThemeProvider`/`next-themes` |
| 22 | Write a real README | 🔲 Not started | Replace default Next.js template with project docs, CSV format, setup instructions |

### Phase 6 — Performance

| # | Task | Status | Notes |
|---|---|---|---|
| 23 | Memoize tab content with `React.memo` | 🔲 Not started | Prevent full re-renders when switching tabs |
| 24 | Move CSV parsing to Web Worker | 🔲 Not started | For large files (>50MB) to avoid blocking main thread |
| 25 | Lazy-load Recharts with `React.lazy` + `Suspense` | 🔲 Not started | Load chart library per tab on demand |

---

## Progress Summary

| Category | Done | Remaining | Total |
|---|---|---|---|
| User-requested features | 2 | 0 | 2 |
| Improvement plan items | 0 | 25 | 25 |
| **Overall** | **2** | **25** | **27** |

---

## Files Modified This Session

| File | Changes |
|---|---|
| `app/page.tsx` | Added `determineFileOrder()`, `mergeCSVFiles()`, `importedFileNames` state, `ignoreIdle` state, multi-file handlers, ignore-idle stats filtering, updated UI text/labels |

## Files Created This Session

| File | Purpose |
|---|---|
| `docs/01-project-analysis.md` | Full project overview, tech stack, folder structure, architecture, data flow, feature inventory |
| `docs/02-issues-and-improvement-plan.md` | Detailed issues list (17 items) with 6-phase improvement plan including code examples |
| `docs/03-changes-made.md` | Detailed changelog of the two features implemented (multi-CSV, ignore-idle) |
| `docs/04-master-task-tracker.md` | **This file** — single checklist of all tasks with status tracking |
