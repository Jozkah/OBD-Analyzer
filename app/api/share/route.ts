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
  return Buffer.concat(chunks)
}

// POST /api/share  { csv: string }  ->  { id, expiresAt }
export async function POST(req: Request) {
  const cfg = shareConfig()
  if (!cfg) {
    return NextResponse.json({ error: "sharing_not_configured" }, { status: 501 })
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
