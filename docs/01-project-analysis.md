# OBD Data Analyzer — Project Analysis

> Generated: April 2, 2026
> Scope: Full codebase review of the OBD-Analyzer project

---

## 1. Project Overview

This is a **client-side automotive telemetry data analyzer** built with Next.js. Users upload CSV files exported from OBD-II (On-Board Diagnostics) scanners, and the app parses, visualizes, and analyzes the data across multiple dashboard tabs: Overview, Performance, Engine, PID Analysis, and GPS Track.

The app is a **single-user, zero-backend tool** — all processing happens in the browser. There is no database, no API routes, and no authentication. It was scaffolded with v0.dev (Vercel's AI tool) and uses shadcn/ui components.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript (strict mode) | ^5 |
| UI Library | React | ^18 |
| Component Library | shadcn/ui (Radix UI + Tailwind) | latest |
| Charting | Recharts (Line, Area, Bar, Composed) | latest |
| Styling | Tailwind CSS + CSS variables | ^3.4.17 |
| CSV Parsing | Manual implementation (`.split(",")`) | N/A |
| GPS Map | Custom Canvas rendering | N/A |
| Package Manager | pnpm | — |
| Font | Inter via `next/font/google` | — |

### Unused Dependencies (installed but never imported)

These are in `package.json` but no source file imports them:

- `papaparse` — CSV parser (the app uses manual `.split(",")` instead)
- `react-dropzone` — drag-and-drop (the app uses native HTML5 drag events)
- `react-hook-form`, `@hookform/resolvers` — form handling
- `zod` — schema validation
- `react-day-picker` — date picker
- `embla-carousel-react` — carousel
- `react-resizable-panels` — resizable panels
- `sonner` — toast notifications
- `vaul` — drawer component
- `cmdk` — command menu
- `input-otp` — OTP input
- `geist` — Geist font (Inter is used instead)
- ~10 Radix UI packages (`@radix-ui/react-accordion`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-switch`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`)

### Version Pinning Issue

20+ dependencies use `"latest"` instead of pinned versions. Any `pnpm install` could introduce breaking changes.

---

## 3. Folder & File Structure

```
OBD-Analyzer/
├── app/
│   ├── layout.tsx              ← Root layout: Inter font, hardcoded dark mode, metadata
│   ├── globals.css             ← ACTIVE: Tailwind + dark theme CSS vars + Leaflet/scrollbar overrides
│   ├── loading.tsx             ← Returns null (no-op loading state)
│   ├── page.tsx                ← ★ THE ENTIRE APP (~3,000 lines, everything inline)
│   └── changelogs/
│       └── page.tsx            ← Static changelog page (versions 1.0.0–1.5.1)
├── components/
│   ├── ui/                     ← ✅ ACTIVE: shadcn/ui primitives used by app
│   │   ├── alert-dialog.tsx    ← Used by page.tsx (missing PIDs dialog)
│   │   ├── badge.tsx           ← Used by changelogs/page.tsx
│   │   ├── button.tsx          ← Used by page.tsx
│   │   ├── card.tsx            ← Used by page.tsx, changelogs/page.tsx
│   │   ├── checkbox.tsx        ← Used by page.tsx
│   │   ├── dropdown-menu.tsx   ← Used by page.tsx
│   │   ├── input.tsx           ← Used by page.tsx
│   │   ├── separator.tsx       ← Used by changelogs/page.tsx
│   │   ├── slider.tsx          ← Used by page.tsx
│   │   └── tabs.tsx            ← Used by page.tsx
│   ├── button.tsx              ← ❌ DEAD: exact duplicate of ui/button.tsx
│   ├── card.tsx                ← ❌ DEAD: exact duplicate of ui/card.tsx
│   ├── checkbox.tsx            ← ❌ DEAD: exact duplicate of ui/checkbox.tsx
│   ├── slider.tsx              ← ❌ DEAD: near-duplicate of ui/slider.tsx
│   ├── tabs.tsx                ← ❌ DEAD: exact duplicate of ui/tabs.tsx
│   ├── dashboard.tsx           ← ❌ DEAD: 1,165-line abandoned component (replaced by page.tsx)
│   ├── data-table.tsx          ← ❌ DEAD: imports non-existent @/components/ui/table
│   ├── file-upload.tsx         ← ❌ DEAD: only imported by dead dashboard.tsx
│   ├── metric-chart.tsx        ← ❌ DEAD: prop mismatch with dashboard.tsx caller
│   ├── metric-selector.tsx     ← ❌ DEAD: prop mismatch with dashboard.tsx caller
│   ├── theme-provider.tsx      ← ❌ DEAD: never imported (dark mode is hardcoded)
│   └── track-map.tsx           ← ❌ DEAD: replaced by inline GPSTrackMap in page.tsx
├── lib/
│   └── utils.ts                ← cn() utility (clsx + tailwind-merge), used by ui/ components
├── styles/
│   └── globals.css             ← ❌ DEAD: duplicate of app/globals.css with different CSS var values
├── public/
│   ├── sample-data.csv         ← Sample OBD data for demo loading
│   └── images/
│       └── reference-dashboard.png  ← Reference image (satellite-texture.png is MISSING)
└── Config files
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── next.config.mjs
    └── components.json          ← shadcn/ui config
```

### Dead Code Summary

**12 out of 23 source files are dead code** (~1,700 lines) that is never imported or reachable from any active code path.

| Category | Dead Files |
|---|---|
| Duplicate UI wrappers | `components/button.tsx`, `card.tsx`, `checkbox.tsx`, `slider.tsx`, `tabs.tsx` |
| Abandoned feature attempt | `components/dashboard.tsx`, `data-table.tsx`, `file-upload.tsx`, `metric-chart.tsx`, `metric-selector.tsx` |
| Unused utilities | `components/theme-provider.tsx`, `components/track-map.tsx` |
| Duplicate stylesheet | `styles/globals.css` |

---

## 4. Architecture & Data Flow

### Entry Points

- `app/layout.tsx` — Root layout, loads Inter font, hardcodes `className="dark"` on `<html>`, imports `globals.css`
- `app/page.tsx` — The `AutomotiveAnalyzer` component, the entire application

### Data Flow

```
User drops/selects CSV file(s)
        │
        ▼
┌─ File Handling ──────────────────────────────────────┐
│  (Multi-CSV: determineFileOrder → mergeCSVFiles)     │
│  Single merged File object                           │
└──────────────────────────────────────────────────────┘
        │
        ▼
┌─ parseCSV() ─────────────────────────────────────────┐
│  1. Read file as text                                 │
│  2. Split lines, filter comment lines (# prefix)     │
│  3. Detect numeric columns from first 10 rows         │
│  4. Auto-detect speed unit (km/h vs mph)              │
│  5. Map OBD column names → standard keys              │
│     (rpm, speed, throttle, boost, coolantTemp, etc.)  │
│  6. Parse all rows into DataPoint[]                   │
│  7. Calculate gear from RPM/speed ratios              │
│  8. Check for missing crucial PIDs                    │
│  9. Enable first 6 non-empty metrics                  │
└───────────────────────────────────────────────────────┘
        │
        ▼
    React State (25+ useState hooks)
    ├── data: DataPoint[]            ← All parsed records
    ├── metrics: MetricConfig[]      ← All detected metrics with enabled/disabled/color
    ├── currentTime: number          ← Index of current data point (playback cursor)
    ├── timeRange: [number, number]  ← Visible time window
    ├── transmissionConfig           ← Gear ratios, final drive, tyre size, etc.
    ├── ignoreIdle: boolean          ← Exclude speed=0 from statistics
    ├── importedFileNames: string[]  ← Ordered list of imported CSV filenames
    └── ~20 more UI state variables
        │
        ▼
    Derived State (useMemo)
    ├── filteredData     ← data.slice(timeRange[0], timeRange[1]+1)
    ├── finalChartData   ← filteredData downsampled to max 500 points
    ├── stats            ← max/avg RPM, speed, boost, coolant, intake, power, torque
    ├── filteredMetrics  ← metrics filtered by search + sort + empty PID toggle
    ├── tempSensors      ← detected temperature sensor keys
    └── autoDetection    ← gear ratio auto-detection results
        │
        ▼
┌─ Tab Components (ALL inline in page.tsx) ────────────┐
│  Overview    → ComposedChart + Session Stats + PIDs   │
│  Performance → RPM/Speed, Throttle, Power, Gearbox    │
│  Engine      → Temperature, Ignition, Boost, Fuel     │
│  PID Analysis→ Custom multi-PID comparison charts     │
│  GPS Track   → Canvas-rendered GPS path (speed color) │
└───────────────────────────────────────────────────────┘
```

### Key Interactions

- **Time slider** — Controls `currentTime` and `timeRange`, which slices and downsamples data for charts
- **Play/Pause** — Auto-advances `currentTime` at 100ms intervals via `setInterval`
- **Metrics sidebar** — Toggles which lines appear on the Overview chart via `metrics[i].enabled`
- **PID Analysis tab** — Users add/remove individual PIDs to create custom comparison charts (synced cursors via `syncId`)
- **Transmission dialog** — Modal with manual entry, presets, auto-detection, and import/export for gear ratio configuration
- **Ignore Idle checkbox** — Filters `speed === 0` data points from statistics while keeping them in charts
- **Multi-CSV import** — Multiple files are ordered by filename/timestamp and merged before parsing

### Data Types

```typescript
interface DataPoint {
  time: number
  timestamp: string
  rpm: number
  speed: number
  throttle: number
  brake: number
  boost: number
  coolantTemp: number
  intakeTemp: number
  fuelRate: number
  latitude?: number
  longitude?: number
  gear?: number
  steering?: number
  enginePower?: number
  engineTorque?: number
  afr?: number
  ignitionAdvance?: number
  catTemp?: number
  oilTemp?: number
  transTemp?: number
  exhaustTemp?: number
  tripDuration?: number
  tripDistance?: number
  tripFuel?: number
  tripFuelEconomy?: number
  maxSpeed?: number
  [key: string]: any  // Dynamic col_X properties for unmapped columns
}

interface MetricConfig {
  key: keyof DataPoint | string
  label: string
  color: string
  unit: string
  enabled: boolean
  scale?: number
  originalName?: string
}
```

### Column Mapping Logic

The CSV parser uses a two-pass approach:
1. **First pass (10 rows):** Detect which columns are numeric
2. **Second pass (all rows):** Parse values and map column headers to standard keys using `toLowerCase().includes()` matching

Headers are shortened via an extensive abbreviation dictionary (e.g., "Engine coolant temperature" → "Coolant Temp", "Intake manifold absolute pressure" → "MAP").

Units are extracted from parenthetical suffixes in headers or inferred from header keywords.

---

## 5. Configuration Files

### next.config.mjs
- `typescript.ignoreBuildErrors: true` — **Suppresses all TypeScript errors at build time**
- `eslint.ignoreDuringBuilds: true` — **Suppresses all ESLint errors at build time**
- `images.unoptimized: true` — Disables Next.js image optimization

### tsconfig.json
- `strict: true` — TypeScript strict mode enabled (but errors are ignored in build)
- `target: ES6`
- Path alias: `@/*` → `./*`
- `moduleResolution: bundler`

### tailwind.config.ts
- Dark mode via `class` strategy
- Full shadcn/ui color system with CSS variable-driven theming
- Sidebar color tokens defined (but no sidebar exists in the app)
- Accordion animations defined
- Plugin: `tailwindcss-animate`

### components.json (shadcn/ui)
- Style: `default`
- RSC: `true`
- Icon library: `lucide`
- Aliases configured for `@/components`, `@/lib`, `@/components/ui`, `@/hooks`

---

## 6. Pages & Routes

| Route | File | Type | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | Client Component (`"use client"`) | Main analyzer application |
| `/changelogs` | `app/changelogs/page.tsx` | Server Component | Static changelog listing |

---

## 7. Feature Inventory

| Feature | Status | Notes |
|---|---|---|
| CSV file upload (button) | ✅ Working | Via hidden file input |
| CSV drag-and-drop | ✅ Working | Native HTML5 drag events |
| Multi-CSV import & merge | ✅ Working | Auto-orders by filename/timestamp, merges headers |
| Sample data loading | ✅ Working | Fetches `/sample-data.csv` |
| CSV comment line support | ✅ Working | Filters lines starting with `#` |
| European decimal format | ✅ Working | Comma → period normalization |
| Speed unit auto-detection | ✅ Working | km/h vs mph from headers and data ranges |
| Metric toggle sidebar | ✅ Working | Checkbox per PID with search, sort, empty filter |
| Overview chart | ✅ Working | ComposedChart with toggled metrics |
| Session statistics | ✅ Working | Max/avg for RPM, speed, boost, temps, power, torque |
| Ignore idle (statistics) | ✅ Working | Checkbox excludes speed=0 from stats, keeps in charts |
| Time playback | ✅ Working | Play/pause/reset with 100ms interval |
| Time range slider | ✅ Working | Dual-thumb slider for windowing |
| RPM vs Speed chart | ✅ Working | Dual Y-axis ComposedChart |
| Throttle vs Speed chart | ✅ Working | Dual Y-axis ComposedChart |
| Power & Torque chart | ✅ Working | Area + Line ComposedChart |
| Gearbox usage chart | ✅ Working | Calculated gear + speed overlay |
| Gear distribution | ✅ Working | BarChart of gear percentages |
| Engine temperature chart | ✅ Working | Multi-sensor AreaChart with sensor toggle |
| Ignition advance chart | ✅ Working | LineChart |
| Boost pressure chart | ✅ Working | LineChart |
| Fuel consumption chart | ✅ Working | AreaChart |
| Throttle & brake chart | ✅ Working | Brake has synthetic random data when missing |
| PID analysis (custom charts) | ✅ Working | Select any PIDs, synced cursors |
| GPS track visualization | ✅ Working | Canvas-based, speed-colored path |
| GPS map styles | ✅ Working | Satellite/street/terrain toggle |
| Missing PID detection | ✅ Working | Alert dialog for crucial missing PIDs |
| Transmission config (manual) | ✅ Working | Gear ratios, final drive, tyre diameter, shift RPM |
| Transmission presets | ✅ Working | 7 car presets with search/sort |
| Transmission auto-detection | ✅ Working | Detects gear ratios from RPM/speed data |
| Transmission import/export | ✅ Working | JSON file import/export |
| Tire size calculator | ✅ Working | Width/aspect/rim → diameter conversion |
| Changelog page | ✅ Working | Static list at `/changelogs` |
| Theme switching | ❌ Hardcoded | Dark mode only, `ThemeProvider` exists but unused |
| Data export | ❌ Missing | No way to export processed/filtered data |
| Mobile tabs 3-5 | ❌ Hidden | Engine, PID Analysis, GPS are `hidden md:block` |
| Error boundaries | ❌ Missing | Chart/canvas errors crash the entire page |
| Tests | ❌ Missing | Zero test files |
