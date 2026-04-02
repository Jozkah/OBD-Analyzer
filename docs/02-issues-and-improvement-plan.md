# OBD Data Analyzer — Issues, Risks & Improvement Plan

> Generated: April 2, 2026
> Scope: All identified issues and a prioritized implementation plan

---

## Issues & Risks

### Critical Severity

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **God Component**: `app/page.tsx` is ~3,000 lines containing ALL business logic, CSV parsing, 25+ state variables, 5 tab views, GPS canvas rendering, gear calculation, transmission dialog, and every chart. | `app/page.tsx` (entire file) | Unmaintainable; any change risks regressions; impossible to test in isolation |
| 2 | **Build errors suppressed**: `next.config.mjs` sets `ignoreBuildErrors: true` for both TypeScript AND ESLint. Real type errors and lint violations are invisible. | `next.config.mjs` lines 3–12 | Type errors go undetected; bugs hide in production |
| 3 | **Missing asset**: `GPSTrackMap` tries to load `/images/satellite-texture.png` but only `reference-dashboard.png` exists in `public/images/`. Falls back silently. | `app/page.tsx` line ~137 | Console error on every GPS tab render |
| 4 | **`latest` versions**: 20+ dependencies pinned to `"latest"` in `package.json`. | `package.json` lines 14–42 | Any `pnpm install` can break the build |
| 5 | **Fake brake data**: When brake data is missing, a random value is generated: `Math.random() * 0.3`. This injects non-deterministic noise into telemetry data. | `app/page.tsx` line ~1159 | Misleading data in Engine tab's Throttle & Brake chart |

### High Severity

| # | Issue | Location | Impact |
|---|---|---|---|
| 6 | **12 dead files** (~1,700 lines): Duplicated components, abandoned `dashboard.tsx`, unused `theme-provider.tsx`, dead `styles/globals.css`. | `components/` root, `styles/` | Confuses new developers; increases bundle scan time |
| 7 | **PapaParse installed but not used**: CSV parsing uses manual `.split(",")`, which breaks on quoted fields containing commas (e.g., `"Engine, RPM"`). PapaParse is in `package.json` but never imported. | `app/page.tsx` line ~833 | CSV files with quoted commas will misparsed |
| 8 | **`Math.max(...array)` on large arrays**: For datasets with >100k points, `Math.max(...validRPMs)` will throw `RangeError: Maximum call stack exceeded`. | `app/page.tsx` lines ~1373–1400 | App crashes on large CSV files |
| 9 | **No error boundary**: If Recharts or canvas rendering throws, the entire page crashes with no recovery. | App-wide | White screen of death with no recovery |
| 10 | **Unused module-level constants**: `GEAR_RATIOS`, `FINAL_DRIVE`, `TYRE_DIAMETER_MM`, `TYRE_CIRCUMFERENCE`, `SHIFT_RPM` are defined but never referenced — only the `transmissionConfig` state is used. | `app/page.tsx` lines ~370–376 | Dead code confusion |
| 11 | **No `key` stability / memoization on tab content**: Charts fully re-render when unrelated state changes because nothing is memoized. | All `TabsContent` sections | Poor performance with large datasets |

### Medium Severity

| # | Issue | Location | Impact |
|---|---|---|---|
| 12 | **Regex issue**: `nameWithoutUnits` uses `$$[^)]*$$` which matches dollar signs, not parentheses. Should be `\([^)]*\)` or escaped differently in context. | `app/page.tsx` line ~948 | Unit extraction from column names may fail |
| 13 | **Hardcoded dark mode**: `<html className="dark">` in `layout.tsx` bypasses `ThemeProvider` and `next-themes`. No way for users to switch themes. | `app/layout.tsx` line 20 | No light mode option |
| 14 | **Duplicate PID sidebar**: The "Available PIDs" sidebar with search/sort is copy-pasted verbatim between the Overview tab and PID Analysis tab (~80 lines of identical JSX). | `app/page.tsx` (two locations) | Maintenance burden; changes must be made twice |
| 15 | **`any` types throughout**: `transmissionConfig`, `autoDetectionResults`, `detectGearRatios` return type, gear ratio objects all use `any`. | Multiple locations in `app/page.tsx` | No type safety on core domain logic |
| 16 | **Leaflet CSS with no Leaflet**: `app/globals.css` has Leaflet-specific styles but the map is canvas-based. | `app/globals.css` lines 87–113 | Unused CSS in bundle |
| 17 | **`onCheckedChange` type mismatch**: `onCheckedChange={setShowEmptyPIDs}` passes `boolean \| "indeterminate"` to a `boolean` setter. TypeScript would flag this if `ignoreBuildErrors` weren't `true`. | `app/page.tsx` line ~1625 | Potential runtime type issue |

---

## Implementation Plan

### Phase 1 — Cleanup & Hygiene (Low Effort, High Impact)

**Goal:** Remove noise, reduce confusion for new developers.

#### 1.1 Delete dead files

Delete these 13 files:
- `components/button.tsx` (duplicate of `ui/button.tsx`)
- `components/card.tsx` (duplicate of `ui/card.tsx`)
- `components/checkbox.tsx` (duplicate of `ui/checkbox.tsx`)
- `components/slider.tsx` (duplicate of `ui/slider.tsx`)
- `components/tabs.tsx` (duplicate of `ui/tabs.tsx`)
- `components/dashboard.tsx` (1,165 lines, abandoned, never imported)
- `components/data-table.tsx` (imports non-existent `@/components/ui/table`)
- `components/file-upload.tsx` (only imported by dead `dashboard.tsx`)
- `components/metric-chart.tsx` (prop mismatch, only imported by dead `dashboard.tsx`)
- `components/metric-selector.tsx` (prop mismatch, only imported by dead `dashboard.tsx`)
- `components/theme-provider.tsx` (never imported)
- `components/track-map.tsx` (replaced by inline `GPSTrackMap` in `page.tsx`)
- `styles/globals.css` (duplicate, never imported; active version is `app/globals.css`)

#### 1.2 Remove unused dependencies from `package.json`

Remove from `dependencies`:
```
@hookform/resolvers
@radix-ui/react-accordion
@radix-ui/react-aspect-ratio
@radix-ui/react-avatar
@radix-ui/react-collapsible
@radix-ui/react-context-menu
@radix-ui/react-dialog
@radix-ui/react-hover-card
@radix-ui/react-label
@radix-ui/react-menubar
@radix-ui/react-navigation-menu
@radix-ui/react-popover
@radix-ui/react-progress
@radix-ui/react-radio-group
@radix-ui/react-scroll-area
@radix-ui/react-select
@radix-ui/react-switch
@radix-ui/react-toast
@radix-ui/react-toggle
@radix-ui/react-toggle-group
@radix-ui/react-tooltip
cmdk
embla-carousel-react
geist
input-otp
react-day-picker
react-dropzone
react-hook-form
react-resizable-panels
sonner
vaul
```

Keep `papaparse` if migrating to it (Phase 4), otherwise remove.
Keep `zod` if adding form validation later, otherwise remove.

#### 1.3 Pin all `"latest"` versions

Extract exact versions from `pnpm-lock.yaml` and replace every `"latest"` with a pinned version.

#### 1.4 Remove fake brake data generation

```diff
- if (!dataPoint.brake && dataPoint.throttle)
-   dataPoint.brake = Math.max(0, (100 - dataPoint.throttle) * Math.random() * 0.3)
+ if (!dataPoint.brake) dataPoint.brake = 0
```

#### 1.5 Remove unused module-level constants

Delete the unused constants block (~line 370):
```typescript
// REMOVE:
const GEAR_RATIOS = { ... }
const FINAL_DRIVE = 4.35
const TYRE_DIAMETER_MM = 647
const TYRE_CIRCUMFERENCE = (Math.PI * TYRE_DIAMETER_MM) / 1000
const SHIFT_RPM = 6900
```

#### 1.6 Remove Leaflet CSS

Remove the Leaflet-specific CSS block from `app/globals.css` (lines ~87–113).

---

### Phase 2 — Re-enable Safety Nets (Low Effort, Critical)

**Goal:** Catch real bugs before they reach production.

#### 2.1 Remove `ignoreBuildErrors`

In `next.config.mjs`:
```diff
  const nextConfig = {
-   typescript: {
-     ignoreBuildErrors: true,
-   },
    images: {
      unoptimized: true,
    },
-   eslint: {
-     ignoreDuringBuilds: true,
-   },
  }
```

#### 2.2 Fix type errors that surface

Expected issues:
- `onCheckedChange={setShowEmptyPIDs}` — needs `(checked) => setShowEmptyPIDs(checked === true)`
- `any` types on `transmissionConfig`, `autoDetectionResults`, `detectGearRatios`
- Potential issues in `calculateGear` parameter types

#### 2.3 Add proper TypeScript interfaces

```typescript
interface TransmissionConfig {
  gearRatios: Record<number, number>
  finalDrive: number
  tyreDiameterMm: number
  shiftRpm: number
  numberOfGears: number
}

interface GearDetectionResult {
  detectedGears: number
  gearRatios: Record<number, number>
  gearStats: Record<number, { count: number; avgRatio: number; minSpeed: number; maxSpeed: number }>
  estimatedFinalDrive: number
  estimatedTireDiameter: number
  confidence: number
}
```

---

### Phase 3 — Decompose the God Component (Medium Effort, Highest Impact)

**Goal:** Make the codebase maintainable, testable, and extendable.

#### 3.1 Extract utility modules

| New File | Functions to Extract |
|---|---|
| `lib/csv-parser.ts` | `parseCSV`, `parseNumericValue`, `detectSpeedUnit`, `shortenColumnName`, `extractUnit`, `generateColor`, `determineFileOrder`, `mergeCSVFiles` |
| `lib/gear-calculator.ts` | `calculateGear`, `detectGearRatios`, `getShiftIndicator`, `calculateTireDiameter`, `parseTireSize` |
| `lib/formatters.ts` | `formatValue`, `checkMissingCrucialPIDs`, `formatTripDuration` |
| `lib/constants.ts` | `CRUCIAL_PIDS`, `defaultMetrics`, transmission presets, color palette |
| `lib/types.ts` | `DataPoint`, `MetricConfig`, `TransmissionConfig`, `GearDetectionResult` |

#### 3.2 Extract UI components

| New Component | Current Location | Lines Saved |
|---|---|---|
| `components/metrics-sidebar.tsx` | Duplicated in Overview & PID Analysis tabs | ~80 lines (×2) |
| `components/gps-track-map.tsx` | Inline `GPSTrackMap` function component | ~150 lines |
| `components/transmission-dialog.tsx` | Bottom of page.tsx, inside JSX | ~300 lines |
| `components/session-stats.tsx` | Inside Overview tab JSX | ~70 lines |
| `components/missing-pids-dialog.tsx` | Inside page.tsx JSX | ~50 lines |

#### 3.3 Extract tab content components

| New Component | Props |
|---|---|
| `components/tabs/overview-tab.tsx` | `data, metrics, finalChartData, stats, currentDataPoint, transmissionConfig, speedUnit, ignoreIdle, ...handlers` |
| `components/tabs/performance-tab.tsx` | `finalChartData, transmissionConfig, speedUnit` |
| `components/tabs/engine-tab.tsx` | `finalChartData, tempSensors, selectedTempSensors` |
| `components/tabs/pid-analysis-tab.tsx` | `data, metrics, finalChartData, selectedPIDs, ...handlers` |
| `components/tabs/gps-tab.tsx` | `data, currentTime` |

#### 3.4 Resulting page.tsx structure (~200 lines)

```tsx
export default function AutomotiveAnalyzer() {
  // State declarations
  // Parsing callbacks
  // File handling callbacks
  // Derived data (useMemo)

  return (
    <div>
      <Header />
      <MissingPIDsDialog />
      <ControlBar />
      <Tabs>
        <OverviewTab />
        <PerformanceTab />
        <EngineTab />
        <PIDAnalysisTab />
        <GPSTab />
      </Tabs>
      <DropZone />
      <TransmissionDialog />
    </div>
  )
}
```

---

### Phase 4 — Correctness & Robustness (Medium Effort)

#### 4.1 Use PapaParse for CSV parsing

```typescript
import Papa from 'papaparse'

const result = Papa.parse(text, {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  comments: '#',
})
```

Benefits: Handles quoted fields, streaming for large files, proper error reporting.

#### 4.2 Replace `Math.max(...array)` with safe implementation

```typescript
function safeMax(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((max, val) => val > max ? val : max, -Infinity)
}

function safeMin(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((min, val) => val < min ? val : min, Infinity)
}
```

Apply to all `Math.max(...array)` and `Math.min(...array)` calls in `stats` computation and `GPSTrackMap`.

#### 4.3 Add React error boundary

```tsx
// components/error-boundary.tsx
class ChartErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return <div className="text-red-400 p-4">Chart failed to render. Try adjusting your data range.</div>
    }
    return this.props.children
  }
}
```

Wrap each `TabsContent` and the `GPSTrackMap` canvas.

#### 4.4 Add missing satellite texture or remove reference

Either:
- Add `/public/images/satellite-texture.png`
- Or remove the `useEffect` that loads it and simplify the satellite background

#### 4.5 Fix regex in `shortenColumnName`

The expression `$$[^)]*$$` should use escaped parentheses to match actual parentheses in column names.

---

### Phase 5 — UX & Accessibility (Higher Effort)

#### 5.1 Mobile tab access

Tabs 3–5 (Engine, PID Analysis, GPS) are `hidden md:block`. Options:
- Horizontal scrollable tab bar
- "More" dropdown for overflow tabs
- Collapsible accordion on mobile

#### 5.2 Theme switching

Use the already-installed `next-themes`:
```tsx
// app/layout.tsx
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

#### 5.3 Proper README

Replace the default Next.js template with:
- Project description and screenshots
- CSV format documentation (supported columns, format requirements)
- Setup instructions
- Feature list
- Architecture overview

---

### Phase 6 — Performance (Higher Effort, For Scale)

#### 6.1 Memoize tab content

Wrap each tab component with `React.memo` to prevent re-renders when switching between tabs or when unrelated state changes.

#### 6.2 Web Worker for CSV parsing

For large files (>50MB), move `parseCSV` to a Web Worker to avoid blocking the main thread:
```typescript
const worker = new Worker(new URL('../workers/csv-parser.ts', import.meta.url))
worker.postMessage({ fileText })
worker.onmessage = (e) => setData(e.data.parsedData)
```

#### 6.3 Lazy-load Recharts per tab

```tsx
const PerformanceTab = React.lazy(() => import('@/components/tabs/performance-tab'))

<Suspense fallback={<div>Loading charts...</div>}>
  <PerformanceTab />
</Suspense>
```

---

## Priority Matrix

| Priority | Phase | Effort | Items |
|---|---|---|---|
| 🔴 Critical | Phase 1 | Low | Delete dead files, pin versions, remove fake data |
| 🔴 Critical | Phase 2 | Low | Re-enable TypeScript/ESLint, fix type errors |
| 🟠 High | Phase 3 | Medium | Decompose God Component into modules |
| 🟠 High | Phase 4.1–4.3 | Medium | PapaParse, safe Math.max, error boundaries |
| 🟡 Medium | Phase 4.4–4.5 | Low | Missing asset, regex fix |
| 🟡 Medium | Phase 5 | Medium | Mobile tabs, theme switching, README |
| 🟢 Low | Phase 6 | High | Memoization, Web Workers, lazy loading |
