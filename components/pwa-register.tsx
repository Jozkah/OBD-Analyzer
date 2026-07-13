"use client"

import { useEffect } from "react"

// Registers the service worker (see public/sw.js) for offline support. Only runs in
// production — in dev the SW would fight Next's HMR/websocket and serve stale chunks.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is best-effort; ignore registration failures */
      })
    }
    // Wait for load so SW registration doesn't compete with initial page rendering.
    if (document.readyState === "complete") register()
    else {
      window.addEventListener("load", register)
      return () => window.removeEventListener("load", register)
    }
  }, [])
  return null
}
