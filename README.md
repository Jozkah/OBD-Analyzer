# OBD Analyzer

A fast, **fully client-side** dashboard for analyzing automotive telemetry logged from your car's OBD-II port. Drop in a CSV exported by an OBD-II scanner app and explore your drive across interactive charts and a GPS track map — no account, no server, no data ever leaves your browser.

> All parsing and rendering happens locally in the browser. There is **no backend, no database, and no telemetry**. Host it as a static site or just run it locally.

## Why I built this

I datalog every trip from my car's OBD-II port — but actually *reading* those logs was always the worst part. Any time I wanted to answer a simple question (what was boost doing on that pull? did the coolant temp creep up? where on the route did it stumble?) I was back to wrangling the raw CSV by hand — spreadsheets, manual filters, one-off queries — and none of it was something I could do quickly, let alone from my phone in a car park right after a drive.

**datalog.help** is the tool I wished I'd had: drop in the CSV and *see* the drive immediately — charts, session stats and the GPS track — with no setup and nothing to query. It's fully client-side, so it's just as quick on a phone as on a laptop, and I can check a log the moment I pull over instead of waiting until I'm back at a desk.

## Screenshots

The upload screen, and the analysis dashboard loaded with the bundled sample log:

![OBD Analyzer — upload screen](docs/screenshot-landing.png)

![OBD Analyzer — analysis dashboard](docs/screenshot-dashboard.png)

## Features

- **CSV upload** — single or multiple files; multi-file logs from the same session are merged in order.
- **Automatic column detection** — recognizes common OBD-II PID column names (Engine RPM, Vehicle speed, throttle position, coolant/intake temps, MAP/boost, MAF, lambda, GPS, etc.) and infers units, so exports from different apps "just work".
- **Five analysis tabs:**
  - **Overview** — session summary stats (duration, distance, max/avg speed, …).
  - **Performance** — throttle, brake, boost and speed over time.
  - **Engine** — RPM, coolant/intake temperature, fuel trims.
  - **PID Analysis** — every detected channel as a searchable table; optionally hide all-zero PIDs.
  - **GPS Track** — a canvas map of your route, colored by speed, with start/finish/current markers (satellite / street / terrain shading).
- **Gear estimation** — derives the engaged gear from speed + RPM using a configurable tyre size and gear ratios.
- **Robust number parsing** — tolerates `.`/`,` decimal separators and ignores `#` comment lines.
- **Polished dark "instrument cluster" UI** built with Tailwind CSS and shadcn/ui, with tabular-figure readouts that stay stable as values change.

## Supported input format

A standard wide OBD-II CSV export with a header row, e.g. from **Car Scanner**, **OBD Fusion**, **Torque**, or similar. The first column is a timestamp; remaining columns are PID readings named like `Engine RPM (RPM)`, `Vehicle speed (km/h)`, `Latitude (deg)`, `Longitude (deg)`, etc. Columns you don't have are simply skipped.

A demo log lives at [`public/sample-data.csv`](public/sample-data.csv) — load it from the upload screen to see the app in action.

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000> and upload a CSV (or the bundled sample).

### Production build

```bash
pnpm build && pnpm start
```

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router) + React 18
- TypeScript (strict — the build fails on type errors)
- [Recharts](https://recharts.org) for charts, HTML Canvas for the GPS map
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)

## Project layout

```
app/page.tsx           # the whole app: CSV parsing, column/unit detection, tabs, charts, GPS map
app/layout.tsx         # fonts (Inter + JetBrains Mono) and the dark theme shell
app/globals.css        # design tokens / theme for the instrument-cluster look
app/changelogs/        # changelog page
components/ui/          # shadcn/ui primitives
components/error-boundary.tsx
public/sample-data.csv # demo telemetry log
docs/                  # README screenshots
```

The app is intentionally a single rich client component; contributions that split it into smaller modules are welcome.

## License

[MIT](LICENSE) © Jozkah
