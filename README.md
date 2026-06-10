# OBD Analyzer

A fast, **fully client-side** dashboard for analyzing automotive telemetry logged from your car's OBD-II port. Drop in a CSV exported by an OBD-II scanner app and explore your drive across interactive charts and a GPS track map — no account, no server, no data ever leaves your browser.

> All parsing and rendering happens locally in the browser. There is **no backend, no database, and no telemetry** — host it as a static site or just run it locally. *(The one optional exception is the [share-link feature](#sharing-logs-optional): if a deployer turns it on, clicking **Share** uploads that single log to the deployment's own backend. It's off by default.)*

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
- **Optional expiring share links** — a deployer can enable a Share button that creates a short, self-expiring link to a log. Off by default; see [Sharing logs](#sharing-logs-optional).

## Supported input format

A standard wide OBD-II CSV export with a header row, e.g. from **Car Scanner**, **OBD Fusion**, **Torque**, or similar. The first column is a timestamp; remaining columns are PID readings named like `Engine RPM (RPM)`, `Vehicle speed (km/h)`, `Latitude (deg)`, `Longitude (deg)`, etc. Columns you don't have are simply skipped.

A demo log lives at [`public/sample-data.csv`](public/sample-data.csv) — load it from the upload screen to see the app in action.

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3210> and upload a CSV (or the bundled sample). *(The dev/start port is set to **3210** in `package.json` — change it there if you prefer another.)*

### Production build

```bash
pnpm build && pnpm start
```

## Sharing logs (optional)

By default the app is 100% client-side and nothing you load ever leaves your browser. You can *optionally* enable a **Share** button that creates a short link to a log which **expires automatically**.

When a deployment has this turned on, clicking **Share** uploads the current log to *that deployment's own backend* and returns a link like `https://your-host/?share=ab12CD…`. Anyone with the link sees the same dashboard until it expires (24h by default). This is the only time a log leaves the browser, and only on an explicit click.

**How it works**

- A Next.js route handler (`app/api/share`) stores the gzipped CSV in a Supabase table with an `expires_at`. Reads filter on it, so an expired link returns `404` immediately — even before cleanup deletes the row.
- The browser only ever calls `/api/share`; it never talks to Supabase and never sees any Supabase key. The **service-role** key lives only in server-side environment variables.
- Share ids are 72-bit random (not enumerable), and oversized logs are rejected (2 MB of CSV by default).

**Enabling it**

1. Run [`scripts/share-schema.sql`](scripts/share-schema.sql) once against a Supabase project to create the `obd_shares` table.
2. Set the variables documented in [`.env.example`](.env.example): `NEXT_PUBLIC_SHARING_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SHARE_TTL_HOURS` / `SHARE_MAX_BYTES`).
3. Deploy to a Node/serverless host (e.g. Vercel). With the variables unset, the Share button stays hidden and the app remains a pure static site.

> The share endpoint has no built-in rate limiting. If you expose it publicly, put it behind your host's rate limiter (e.g. Vercel/Upstash) to deter abuse.

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router) + React 18
- TypeScript (strict — the build fails on type errors)
- [Recharts](https://recharts.org) for charts, HTML Canvas for the GPS map
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- [Supabase](https://supabase.com) — *optional*, used only by the share feature

## Project layout

```
app/page.tsx           # the whole app: CSV parsing, column/unit detection, tabs, charts, GPS map
app/layout.tsx         # fonts (Inter + JetBrains Mono) and the dark theme shell
app/globals.css        # design tokens / theme for the instrument-cluster look
app/changelogs/        # changelog page
app/api/share/         # optional share feature: server route handlers (create + fetch)
lib/share.ts           # server-only share helpers (gzip, Supabase config)
components/ui/          # shadcn/ui primitives
components/error-boundary.tsx
public/sample-data.csv # demo telemetry log
scripts/share-schema.sql  # Supabase table for the optional share feature
.env.example           # config for the optional share feature
docs/                  # README screenshots
```

The app is intentionally a single rich client component; contributions that split it into smaller modules are welcome.

## License

[MIT](LICENSE) © Jozkah
