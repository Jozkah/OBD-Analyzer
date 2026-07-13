import type { MetadataRoute } from "next"

// Web app manifest — makes the analyzer installable (Add to Home Screen / Install app) and
// declares how it should launch as a standalone, offline-capable PWA. Next serves this at
// /manifest.webmanifest and injects the <link rel="manifest"> automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OBD Analyzer — datalog.help",
    short_name: "OBD Analyzer",
    description:
      "Fast, fully client-side OBD-II telemetry analyzer. Drop in a CSV and explore your drive — no account, nothing leaves your browser.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#05070d",
    theme_color: "#05070d",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
