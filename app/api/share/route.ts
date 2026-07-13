import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { shareConfig, encodePayload, SHARE_TTL_HOURS, SHARE_MAX_BYTES } from "@/lib/share"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 12 URL-safe characters (~72 bits) — unguessable, so share ids can't be enumerated.
function shortId(): string {
  return randomBytes(9).toString("base64url")
}

// Streams the request body while enforcing a hard byte ceiling, regardless of the
// Content-Length header (which can be omitted via chunked transfer or spoofed). Returns
// the collected bytes, or null once the ceiling is exceeded — at which point the read is
// cancelled so we never buffer an unbounded body into memory.
async function readBodyCapped(req: Request, maxBytes: number): Promise<Buffer | null> {
  const reader = req.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        return null
      }
      chunks.push(Buffer.from(value))
    }
  } catch {
    // The client reset the connection mid-upload. Treat as an aborted request rather than
    // letting the rejection propagate as an unhandled exception out of the handler.
    return null
  }
  return Buffer.concat(chunks)
}

// Best-effort in-memory sliding-window rate limiter keyed by client IP. This deters
// casual abuse of the unauthenticated write endpoint, but note it is per-instance and
// resets on cold start — a serverless deployment with many instances should ALSO put a
// shared limiter (e.g. Upstash/Vercel) in front. See README → "Sharing logs".
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateBuckets = new Map<string, number[]>()

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

function rateLimited(req: Request): boolean {
  const ip = clientIp(req)
  const now = Date.now()
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  hits.push(now)
  rateBuckets.set(ip, hits)
  // Opportunistically evict stale buckets so the map can't grow unbounded.
  if (rateBuckets.size > 5_000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(k)
    }
  }
  return hits.length > RATE_LIMIT_MAX
}

// Same-site guard: reject cross-site writes so the endpoint can't be driven by a
// malicious third-party page across many victims' browsers (which would defeat per-IP
// limiting). Requests with no Origin (e.g. same-origin server-side/no-cors) are allowed.
function isCrossSite(req: Request): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return false
  const host = req.headers.get("host")
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

// Cheap structural check that the payload looks like a CSV, so the endpoint isn't a
// general-purpose anonymous text host. Not authoritative — just raises the bar past
// "any string".
function looksLikeCsv(csv: string): boolean {
  const firstDataLine = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"))
  return !!firstDataLine && firstDataLine.includes(",")
}

// POST /api/share  { csv: string }  ->  { id, expiresAt }
export async function POST(req: Request) {
  const cfg = shareConfig()
  if (!cfg) {
    return NextResponse.json({ error: "sharing_not_configured" }, { status: 501 })
  }

  // Reject cross-site writes (see isCrossSite) before doing any work.
  if (isCrossSite(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Best-effort per-IP rate limiting to deter abuse of this unauthenticated endpoint.
  if (rateLimited(req)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  // Read the body with a HARD byte ceiling enforced by streaming — never trusting the
  // Content-Length header. Without this, an unauthenticated client could stream an
  // unbounded chunked body and exhaust memory before any size check runs (Next's
  // app-router Request.json() has no built-in cap). The ×2 leaves room for JSON/escaping
  // overhead around the raw CSV; the exact CSV-size check is below.
  const raw = await readBodyCapped(req, SHARE_MAX_BYTES * 2)
  if (raw === null) {
    return NextResponse.json({ error: "too_large", maxBytes: SHARE_MAX_BYTES }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const csv = (body as { csv?: unknown }).csv
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return NextResponse.json({ error: "missing_csv" }, { status: 400 })
  }
  if (Buffer.byteLength(csv, "utf8") > SHARE_MAX_BYTES) {
    return NextResponse.json({ error: "too_large", maxBytes: SHARE_MAX_BYTES }, { status: 413 })
  }
  // Reject payloads that don't even look like a CSV, so this isn't a generic text host.
  if (!looksLikeCsv(csv)) {
    return NextResponse.json({ error: "not_csv" }, { status: 422 })
  }

  const id = shortId()
  const expiresAt = new Date(Date.now() + SHARE_TTL_HOURS * 3_600_000).toISOString()

  let res: Response
  try {
    res = await fetch(`${cfg.url}/rest/v1/obd_shares`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ id, payload: encodePayload(csv), expires_at: expiresAt }),
      cache: "no-store",
    })
  } catch {
    return NextResponse.json({ error: "store_unreachable" }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: "store_failed" }, { status: 502 })
  }
  return NextResponse.json({ id, expiresAt })
}
