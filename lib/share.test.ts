import { describe, it, expect, afterEach } from "vitest"
import { encodePayload, decodePayload, shareConfig } from "./share"

describe("share payload codec", () => {
  it("round-trips a CSV through gzip + base64", () => {
    const csv = "Time,Engine RPM (RPM),Latitude (deg)\n0,850,01.44\n1,2100,01.45\n"
    expect(decodePayload(encodePayload(csv))).toBe(csv)
  })

  it("round-trips unicode and long content", () => {
    const csv = "col,°C,N•m\n" + Array.from({ length: 500 }, (_, i) => `${i},${i * 1.5},x`).join("\n")
    expect(decodePayload(encodePayload(csv))).toBe(csv)
  })

  it("produces base64 output (no raw binary)", () => {
    const encoded = encodePayload("a,b\n1,2")
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it("throws on corrupt payload", () => {
    expect(() => decodePayload("not-valid-gzip-base64")).toThrow()
  })
})

describe("shareConfig", () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it("returns null when unconfigured", () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(shareConfig()).toBeNull()
  })

  it("strips trailing slashes from the URL", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co///"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "secret"
    expect(shareConfig()).toEqual({ url: "https://example.supabase.co", key: "secret" })
  })
})
