/** @type {import('next').NextConfig} */

// Security headers applied to every route. The app renders remote/attacker-suppliable
// content (shared CSV logs) and fetches third-party map tiles, so these are defense in
// depth even though no active XSS sink exists today. `img-src` allowlists the three
// opt-in raster tile providers; `connect-src 'self'` keeps the only network egress the
// same-origin share API. `'unsafe-inline'`/`'unsafe-eval'` in script-src are required by
// Next.js 14's runtime hydration in this setup.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https://server.arcgisonline.com https://tile.openstreetmap.org https://a.tile.opentopomap.org",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), interest-cohort=()" },
]

const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
