// Service worker for offline support.
//
// The app is fully client-side, so once the shell + JS/CSS chunks are cached the analyzer
// runs with no network. Because Next emits content-hashed chunk filenames that aren't known
// ahead of time, this uses RUNTIME caching (cache-as-you-go) rather than a build-time
// precache list: everything same-origin that loads on the first online visit is stored and
// reused when offline. Cross-origin requests (e.g. opt-in map tiles) are left untouched.

const CACHE = "obd-analyzer-v2"

self.addEventListener("install", () => {
  // Activate this worker as soon as it's installed, without waiting for old tabs to close.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  // Only manage same-origin traffic; never intercept map tiles or other cross-origin fetches.
  if (url.origin !== self.location.origin) return

  // Never touch dynamic API routes (e.g. /api/share). These must always hit the network fresh —
  // caching a shared-log response could serve a stale or expired log, and intercepting them here
  // also hides them from tools (and tests) that mock the network at the page level.
  if (url.pathname.startsWith("/api/")) return

  // Navigations: network-first so an online user always gets the freshest app, falling back
  // to the cached page (or the app root) when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
          return res
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(req)) || (await cache.match("/")) || Response.error()
        }
      })(),
    )
    return
  }

  // Static assets (JS/CSS/fonts/icons): stale-while-revalidate — serve the cached copy
  // instantly and refresh it in the background when online.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })(),
  )
})
