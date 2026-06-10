import { NextResponse } from "next/server"
import { shareConfig, decodePayload } from "@/lib/share"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/share/:id  ->  { csv, expiresAt }
// Expired or unknown ids return 404. Expiry is enforced in the query itself, so a row
// that is past its expires_at is never served even if cleanup hasn't deleted it yet.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const cfg = shareConfig()
  if (!cfg) {
    return NextResponse.json({ error: "sharing_not_configured" }, { status: 501 })
  }

  const id = params.id
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const nowIso = new Date().toISOString()
  const query =
    `${cfg.url}/rest/v1/obd_shares` +
    `?id=eq.${encodeURIComponent(id)}` +
    `&expires_at=gt.${encodeURIComponent(nowIso)}` +
    `&select=payload,expires_at&limit=1`

  let res: Response
  try {
    res = await fetch(query, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: "no-store",
    })
  } catch {
    return NextResponse.json({ error: "store_unreachable" }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: "store_failed" }, { status: 502 })
  }

  const rows = (await res.json()) as Array<{ payload: string; expires_at: string }>
  const row = Array.isArray(rows) ? rows[0] : undefined
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  let csv: string
  try {
    csv = decodePayload(row.payload)
  } catch {
    return NextResponse.json({ error: "corrupt" }, { status: 500 })
  }
  return NextResponse.json({ csv, expiresAt: row.expires_at })
}
