import type { TileStyle, MapStyle } from "@/types/obd"

// --- Web Mercator helpers + opt-in raster tile sources for the GPS map ----------------
// The default map style is "offline" (no network at all). Selecting Satellite/Street/
// Terrain fetches public raster tiles ONLY then — the one place GPS coordinates leave the
// browser, and only on an explicit click.
export const MAP_TILE_PX = 256

export function mercatorPx(lat: number, lng: number, z: number) {
  const scale = MAP_TILE_PX * 2 ** z
  const x = ((lng + 180) / 360) * scale
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
  return { x, y }
}

// Inverse of mercatorPx: world pixels -> lat/lng. Used by the pan/zoom handlers to turn a
// screen position back into geographic coordinates.
export function mercatorUnpx(x: number, y: number, z: number) {
  const scale = MAP_TILE_PX * 2 ** z
  const lng = (x / scale) * 360 - 180
  const k = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)))
  return { lat, lng }
}

// Largest integer zoom at which the track's bbox still fits the canvas. Tiny/degenerate
// areas clamp to 17 (a level all three providers serve).
export function mercatorFitZoom(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  availW: number,
  availH: number,
) {
  const a = mercatorPx(maxLat, minLng, 0)
  const b = mercatorPx(minLat, maxLng, 0)
  const unitW = Math.abs(b.x - a.x) || 1e-9
  const unitH = Math.abs(b.y - a.y) || 1e-9
  const z = Math.floor(Math.min(Math.log2(availW / unitW), Math.log2(availH / unitH)))
  return Math.max(1, Math.min(17, Number.isFinite(z) ? z : 17))
}

export const MAP_TILE_SOURCES: Record<TileStyle, (z: number, x: number, y: number) => string> = {
  // Esri World Imagery (keyless). Note this provider orders the path as {z}/{y}/{x}.
  satellite: (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  street: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  terrain: (z, x, y) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`,
}

export const MAP_ATTRIBUTION: Record<MapStyle, string> = {
  offline: "",
  satellite: "Imagery © Esri",
  street: "© OpenStreetMap contributors",
  terrain: "© OpenTopoMap (CC-BY-SA)",
}
