// Server-only helpers for the optional "share a log via an expiring link" feature.
// Imported exclusively by the route handlers under app/api/share — never by client code
// (it pulls in node:zlib and reads the secret service-role key).

import { gzipSync, gunzipSync } from "node:zlib"

export type ShareConfig = { url: string; key: string }

/**
 * Returns the Supabase config from the (server-only) environment, or null when sharing
 * has not been configured. Callers return 501 on null so the app degrades gracefully to
 * its default "no backend, nothing leaves the browser" behaviour.
 */
export function shareConfig(): ShareConfig | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ""), key }
}

export const SHARE_TTL_HOURS = Number(process.env.SHARE_TTL_HOURS) || 24
export const SHARE_MAX_BYTES = Number(process.env.SHARE_MAX_BYTES) || 2_000_000

/** gzip + base64 a CSV string for compact at-rest storage. */
export function encodePayload(csv: string): string {
  return gzipSync(Buffer.from(csv, "utf8")).toString("base64")
}

/** Inverse of {@link encodePayload}. Throws on corrupt input. */
export function decodePayload(payload: string): string {
  return gunzipSync(Buffer.from(payload, "base64")).toString("utf8")
}
