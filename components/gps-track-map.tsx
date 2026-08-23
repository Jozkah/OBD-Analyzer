"use client"

import type React from "react"

import { useMemo, useState, useRef, useEffect } from "react"
import { Map, Plus, Minus, Maximize2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DataPoint, MapStyle } from "@/types/obd"
import { safeMax, safeMin } from "@/lib/stats"
import {
  MAP_TILE_PX,
  mercatorPx,
  mercatorUnpx,
  mercatorFitZoom,
  MAP_TILE_SOURCES,
  MAP_ATTRIBUTION,
} from "@/lib/mercator"

// Enhanced GPS Track Map Component with offline + opt-in tile map bases
export function GPSTrackMap({
  data,
  currentTime,
  onNotify,
  theme = "dark",
}: {
  data: DataPoint[]
  currentTime: number
  onNotify?: (msg: string) => void
  /** Tints the offline backdrop/grid so the map surface isn't dark-only on the light theme. */
  theme?: "light" | "dark"
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Default to "offline" so the GPS map makes NO external requests unless the user opts in
  // by choosing a real tile style.
  const [mapStyle, setMapStyle] = useState<MapStyle>("offline")
  // Whether the speed column has usable variation. When it doesn't (all-zero/missing
  // speed, or every sample identical), the speed-gradient coloring is meaningless, so
  // we render a neutral track and hide the misleading gradient legend.
  const [hasSpeedVariation, setHasSpeedVariation] = useState(true)
  // Min/max of the speed-colored track, surfaced so the gradient legend can show a numeric
  // scale (WCAG 1.4.1 — don't convey speed by hue alone).
  const [speedRange, setSpeedRange] = useState<{ min: number; max: number }>({ min: 0, max: 0 })
  // True when every GPS fix sits within a few metres (parked car / single location), so
  // there is no path to draw — we show a message instead of a confusingly blank map.
  const [trackDegenerate, setTrackDegenerate] = useState(false)
  // Raster tile cache so a redraw (e.g. a 100 ms playback tick, or a style re-select)
  // reuses already-loaded tiles instead of refetching. tileVersion bumps when a new tile
  // finishes loading, triggering a redraw that composites it in.
  // `globalThis.Map` because the lucide-react `Map` icon import shadows the global Map
  // constructor in value position.
  const tileCacheRef = useRef<Map<string, HTMLImageElement>>(new globalThis.Map<string, HTMLImageElement>())
  const tileFailedRef = useRef<Set<string>>(new Set())
  const tileInFlightRef = useRef<Set<string>>(new Set())
  const [tileVersion, setTileVersion] = useState(0)
  // Interactive pan/zoom. `view` is null while auto-fitting the whole track; once the user
  // pans or zooms it holds an explicit { zoom, center } that overrides the fit. projRef
  // mirrors the current projection so the wheel/drag handlers can convert screen <-> world.
  const [view, setView] = useState<{ zoom: number; centerLat: number; centerLng: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const projRef = useRef<{ z: number; originX: number; originY: number; width: number; height: number } | null>(null)
  // Holds the teardown for an in-progress drag so we can also remove the window listeners
  // if the component unmounts mid-drag (or a mouseup is never delivered).
  const dragCleanupRef = useRef<(() => void) | null>(null)
  // Offscreen cache of the STATIC scene (backdrop/tiles + track + start/finish). A 100 ms
  // playback tick only moves the live marker, so we rebuild this buffer only when the scene
  // itself changes (data, style, zoom/pan, a newly-loaded tile, or a resize) and otherwise
  // just blit it and redraw the marker on top (#27). staticKeyRef fingerprints the inputs
  // that require a rebuild.
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const staticKeyRef = useRef<string>("")

  const gpsData = useMemo(
    // Only discard the true "no fix" sentinel pair (0,0); a finite point that sits
    // exactly on the equator (lat 0) or prime meridian (lng 0) is a valid fix and
    // must stay on the track. Using Number.isFinite also rejects undefined/NaN.
    () =>
      data.filter(
        (d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && !(d.latitude === 0 && d.longitude === 0),
      ),
    [data],
  )

  // Reset to the auto-fit view whenever a different log is loaded.
  useEffect(() => {
    setView(null)
  }, [gpsData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || gpsData.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    // Only reallocate the canvas backing store when the target pixel size actually
    // changes. Assigning canvas.width/height reallocates the backing store (an
    // expensive op) and would otherwise run on every 100ms playback tick even though
    // only the marker moves. setTransform (below) replaces — not compounds — the
    // matrix, so it is safe to call on every draw whether or not we resized.
    const dpr = window.devicePixelRatio
    const targetW = Math.round(rect.width * dpr)
    const targetH = Math.round(rect.height * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const width = rect.width
    const height = rect.height

    const lats = gpsData.map((d) => d.latitude!)
    const lngs = gpsData.map((d) => d.longitude!)
    const minLat = safeMin(lats)
    const maxLat = safeMax(lats)
    const minLng = safeMin(lngs)
    const maxLng = safeMax(lngs)

    // Degenerate (stationary / single fix): everything within ~20 m, so there is no path
    // to draw — flag it (a message is shown) and skip the polyline.
    const meanLat = (minLat + maxLat) / 2
    const kx = Math.cos((meanLat * Math.PI) / 180) || 1
    const diagMetres = Math.hypot((maxLng - minLng) * kx, maxLat - minLat) * 111_320
    const degenerate = diagMetres < 20
    if (degenerate !== trackDegenerate) setTrackDegenerate(degenerate)

    // Projection: either the user's explicit pan/zoom view, or an auto-fit of the whole
    // track. The SAME projection drives the offline backdrop, the real tiles and the
    // track, so everything stays aligned. projRef mirrors it for the pointer handlers.
    const pad = 28
    let z: number
    let originX: number
    let originY: number
    if (view) {
      z = view.zoom
      const c = mercatorPx(view.centerLat, view.centerLng, z)
      originX = c.x - width / 2
      originY = c.y - height / 2
    } else {
      z = mercatorFitZoom(minLat, maxLat, minLng, maxLng, Math.max(1, width - 2 * pad), Math.max(1, height - 2 * pad))
      const tl = mercatorPx(maxLat, minLng, z)
      const br = mercatorPx(minLat, maxLng, z)
      originX = (tl.x + br.x) / 2 - width / 2
      originY = (tl.y + br.y) / 2 - height / 2
    }
    projRef.current = { z, originX, originY, width, height }
    const toCanvas = (lat: number, lng: number) => {
      const w = mercatorPx(lat, lng, z)
      return { x: w.x - originX, y: w.y - originY }
    }

    // Speed gradient setup. safeMin/safeMax avoid the Math.max(...spread) stack overflow
    // on very large logs.
    const speeds = gpsData.map((d) => d.speed || 0)
    const minSpeed = safeMin(speeds)
    const maxSpeed = safeMax(speeds)
    const speedSpan = maxSpeed - minSpeed
    const speedVaries = speedSpan > 0.001
    if (speedVaries !== hasSpeedVariation) setHasSpeedVariation(speedVaries)
    if (minSpeed !== speedRange.min || maxSpeed !== speedRange.max)
      setSpeedRange({ min: minSpeed, max: maxSpeed })

    // Draws the STATIC route + start/finish markers on top of whatever backdrop is already
    // on the canvas (everything except the per-tick live position marker).
    const paintStaticRoute = () => {
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      const path = gpsData.map((d) => toCanvas(d.latitude!, d.longitude!))
      const neutral = mapStyle === "street" ? "#1d4ed8" : "#67e8f9"
      if (!degenerate && path.length > 1) {
        // Dark casing keeps the bright track legible over satellite imagery.
        ctx.save()
        ctx.strokeStyle = "rgba(0,0,0,0.45)"
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
        ctx.stroke()
        ctx.restore()

        // Per-segment hue by speed (blue = slow → red = fast).
        for (let i = 0; i < path.length - 1; i++) {
          if (speedVaries) {
            const r = ((gpsData[i].speed || 0) - minSpeed) / speedSpan
            ctx.strokeStyle = `hsl(${(1 - r) * 240}, 90%, 58%)`
          } else {
            ctx.strokeStyle = neutral
          }
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(path[i].x, path[i].y)
          ctx.lineTo(path[i + 1].x, path[i + 1].y)
          ctx.stroke()
        }
      }

      // Start / finish (combined into one "S/F" marker when they share a pixel).
      const s = toCanvas(gpsData[0].latitude!, gpsData[0].longitude!)
      const e = toCanvas(gpsData[gpsData.length - 1].latitude!, gpsData[gpsData.length - 1].longitude!)
      const sameSpot = s.x === e.x && s.y === e.y
      ctx.font = "bold 12px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "#22c55e"
      ctx.beginPath()
      ctx.arc(s.x, s.y, 8, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.fillText(sameSpot ? "S/F" : "S", s.x, s.y)
      if (!sameSpot) {
        ctx.fillStyle = "#1f2937"
        ctx.beginPath()
        ctx.arc(e.x, e.y, 8, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = "#ffffff"
        ctx.fillText("F", e.x, e.y)
      }
    }

    // The live position marker — the ONLY element that changes on a 100 ms playback tick.
    // Drawn on top of the (cached) static scene every frame.
    const drawMarker = () => {
      const currentPoint = gpsData.find((p) => (p.time ?? 0) >= currentTime) ?? gpsData[gpsData.length - 1]
      if (Number.isFinite(currentPoint?.latitude) && Number.isFinite(currentPoint?.longitude)) {
        const c = toCanvas(currentPoint.latitude!, currentPoint.longitude!)
        ctx.fillStyle = "#ef4444"
        ctx.beginPath()
        ctx.arc(c.x, c.y, 7, 0, 2 * Math.PI)
        ctx.fill()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(c.x, c.y, 9, 0, 2 * Math.PI)
        ctx.stroke()
      }
    }

    // Paints the whole static scene (backdrop + route + start/finish) to the visible canvas.
    const drawStaticScene = () => {
    // ---- Offline style: no network at all, just a dark backdrop + grid under the track.
    if (mapStyle === "offline") {
      const g = ctx.createLinearGradient(0, 0, 0, height)
      if (theme === "light") {
        g.addColorStop(0, "#eef2f8")
        g.addColorStop(1, "#e2e8f0")
      } else {
        g.addColorStop(0, "#0f172a")
        g.addColorStop(1, "#0b1222")
      }
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = theme === "light" ? "#cbd5e1" : "#1e293b"
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 2])
      for (let i = 0; i <= 10; i++) {
        const x = (width / 10) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let i = 0; i <= 10; i++) {
        const y = (height / 10) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      paintStaticRoute()
      return
    }

    // ---- Tile style (opt-in): composite cached tiles now, fetch any that are missing and
    // redraw as they arrive (via tileVersion). Cached tiles mean a 100 ms playback tick
    // redraws with NO network and no flicker. ------------------------------------------
    const src = MAP_TILE_SOURCES[mapStyle]
    const cache = tileCacheRef.current
    const failed = tileFailedRef.current
    const inFlight = tileInFlightRef.current
    const n = 2 ** z
    const x0 = Math.floor(originX / MAP_TILE_PX)
    const x1 = Math.floor((originX + width) / MAP_TILE_PX)
    const y0 = Math.floor(originY / MAP_TILE_PX)
    const y1 = Math.floor((originY + height) / MAP_TILE_PX)

    ctx.fillStyle = theme === "light" ? "#e2e8f0" : "#0b1222"
    ctx.fillRect(0, 0, width, height)
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue
        const wx = ((tx % n) + n) % n
        const url = src(z, wx, ty)
        const img = cache.get(url)
        if (img) {
          ctx.drawImage(img, tx * MAP_TILE_PX - originX, ty * MAP_TILE_PX - originY, MAP_TILE_PX, MAP_TILE_PX)
        } else if (!failed.has(url) && !inFlight.has(url)) {
          inFlight.add(url)
          const im = new Image()
          // Request tiles with CORS so the canvas isn't tainted and can be exported to PNG.
          // All three providers (Esri/OSM/OpenTopoMap) send Access-Control-Allow-Origin; a
          // provider that didn't would just fail to load and be marked failed, as before.
          im.crossOrigin = "anonymous"
          im.onload = () => {
            inFlight.delete(url)
            cache.set(url, im)
            // Bump to trigger a redraw that composites this tile in. Safe across style
            // changes/unmount: the redraw always uses the CURRENT mapStyle, and a late
            // tile for an old style just sits harmlessly in the cache.
            setTileVersion((v) => v + 1)
          }
          im.onerror = () => {
            inFlight.delete(url)
            failed.add(url)
          }
          im.src = url
        }
      }
    }
    paintStaticRoute()
    }

    // Rebuild the offscreen static buffer only when the scene (NOT currentTime) changes;
    // otherwise reuse it. A playback tick then only blits the cached scene and redraws the
    // marker, instead of re-compositing every tile and re-stroking the whole track each 100 ms
    // (#27). staticKey fingerprints every input that affects the static scene.
    const staticKey = `${targetW}x${targetH}|${z}|${originX}|${originY}|${mapStyle}|${tileVersion}|${gpsData.length}|${minSpeed}|${maxSpeed}|${degenerate}|${theme}`
    let off = offscreenRef.current
    if (!off) {
      off = document.createElement("canvas")
      offscreenRef.current = off
    }
    if (staticKey !== staticKeyRef.current || off.width !== targetW || off.height !== targetH) {
      // Scene changed: paint it fresh onto the visible canvas (the backdrop fill overwrites
      // any previous marker), then snapshot the marker-less result into the offscreen buffer.
      drawStaticScene()
      off.width = targetW
      off.height = targetH
      const offCtx = off.getContext("2d")
      if (offCtx) {
        offCtx.setTransform(1, 0, 0, 1, 0, 0)
        offCtx.clearRect(0, 0, targetW, targetH)
        offCtx.drawImage(canvas, 0, 0)
      }
      staticKeyRef.current = staticKey
    } else {
      // Scene unchanged (typically a playback tick): blit the cached static scene back,
      // clearing the previous marker in the process.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, targetW, targetH)
      ctx.drawImage(off, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    drawMarker()
  }, [gpsData, currentTime, mapStyle, data, tileVersion, view, theme])

  // Mouse-wheel zoom toward the cursor. A native non-passive listener lets us
  // preventDefault so the page doesn't scroll while zooming the map.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = projRef.current
      if (!p) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const cur = mercatorUnpx(p.originX + sx, p.originY + sy, p.z)
      const maxZ = mapStyle === "terrain" ? 17 : 18
      const nz = Math.max(2, Math.min(maxZ, p.z + (e.deltaY < 0 ? 1 : -1)))
      if (nz === p.z) return
      // Keep the geographic point under the cursor fixed on screen across the zoom.
      const cw = mercatorPx(cur.lat, cur.lng, nz)
      const c = mercatorUnpx(cw.x - sx + p.width / 2, cw.y - sy + p.height / 2, nz)
      setView({ zoom: nz, centerLat: c.lat, centerLng: c.lng })
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [mapStyle])

  // Tear down any in-progress drag listeners if the GPS tab unmounts mid-drag.
  useEffect(() => () => dragCleanupRef.current?.(), [])

  // Drag to pan, via Pointer Events so it works for mouse AND touch (single finger).
  // Computed from the drag-start origin each move so it stays smooth even as the
  // projection ref updates between renders. Two-finger pinch zoom isn't handled here —
  // the on-map +/- buttons cover zoom on touch — but the canvas has touch-action: none so
  // a one-finger pan doesn't also scroll the page.
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const p = projRef.current
    if (!p) return
    // Only start a pan for the primary pointer; ignore extra fingers (avoids fighting the
    // browser's own gesture handling on multi-touch).
    if (!e.isPrimary) return
    const start = { ox: p.originX, oy: p.originY, z: p.z, w: p.width, h: p.height, mx: e.clientX, my: e.clientY }
    const move = (ev: PointerEvent) => {
      const c = mercatorUnpx(
        start.ox - (ev.clientX - start.mx) + start.w / 2,
        start.oy - (ev.clientY - start.my) + start.h / 2,
        start.z,
      )
      setView({ zoom: start.z, centerLat: c.lat, centerLng: c.lng })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      dragCleanupRef.current = null
      setDragging(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    // Same teardown, callable from the unmount effect so a dropped pointerup / mid-drag tab
    // switch can't leak the listeners or keep calling setView on a dead component.
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      dragCleanupRef.current = null
    }
    setDragging(true)
  }

  // Keyboard pan/zoom so the map is operable without a mouse. Arrow keys pan by ~50px,
  // +/- (or =) zoom, and 0 resets to the auto-fit view.
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    const p = projRef.current
    if (!p) return
    const panBy = (dx: number, dy: number) => {
      const c = mercatorUnpx(p.originX + p.width / 2 + dx, p.originY + p.height / 2 + dy, p.z)
      setView({ zoom: p.z, centerLat: c.lat, centerLng: c.lng })
    }
    const STEP = 50
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); panBy(-STEP, 0); break
      case "ArrowRight": e.preventDefault(); panBy(STEP, 0); break
      case "ArrowUp": e.preventDefault(); panBy(0, -STEP); break
      case "ArrowDown": e.preventDefault(); panBy(0, STEP); break
      case "+": case "=": e.preventDefault(); zoomByButton(1); break
      case "-": case "_": e.preventDefault(); zoomByButton(-1); break
      case "0": e.preventDefault(); setView(null); break
    }
  }

  // Export the current map view (route + backdrop + markers) as a PNG download. Tiles are
  // loaded with crossOrigin so the canvas isn't tainted; if a browser still blocks the
  // export we surface a friendly note rather than throwing.
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          onNotify?.("Couldn't export the map image.")
          return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "gps-track.png"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, "image/png")
    } catch {
      onNotify?.("Couldn't export the map — try the Offline basemap.")
    }
  }

  // Zoom buttons keep the current centre and step the zoom by one level.
  const zoomByButton = (delta: number) => {
    const p = projRef.current
    if (!p) return
    const center = mercatorUnpx(p.originX + p.width / 2, p.originY + p.height / 2, p.z)
    const maxZ = mapStyle === "terrain" ? 17 : 18
    const nz = Math.max(2, Math.min(maxZ, p.z + delta))
    setView({ zoom: nz, centerLat: center.lat, centerLng: center.lng })
  }

  if (gpsData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Map className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No GPS data available</p>
          <p className="text-sm">Upload a file with latitude and longitude data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        onKeyDown={onCanvasKeyDown}
        tabIndex={0}
        role="img"
        aria-label={
          trackDegenerate
            ? `GPS map: the vehicle was stationary (${gpsData.length} fixes within ~20 m).`
            : `GPS route map, ${gpsData.length} points. Focus it and use arrow keys to pan, plus or minus to zoom, and 0 to reset the view.`
        }
        className={`w-full h-full touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      />
      {trackDegenerate && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <div className="rounded-lg border border-border/70 bg-background/85 px-4 py-3 text-center shadow-lg shadow-black/30 backdrop-blur">
            <p className="text-sm font-medium text-foreground/90">No track to plot</p>
            <p className="mt-0.5 max-w-[17rem] text-xs text-muted-foreground">
              All GPS fixes are within ~20&nbsp;m — the vehicle was stationary, or the log has a single location.
            </p>
          </div>
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-lg border border-border/70 bg-background/85 p-1 shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex gap-1">
          {(["offline", "satellite", "street", "terrain"] as const).map((style) => (
            <Button
              key={style}
              size="sm"
              variant={mapStyle === style ? "default" : "ghost"}
              onClick={() => setMapStyle(style)}
              className="text-xs px-2 py-1"
            >
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <div className="absolute right-3 top-3 rounded-lg border border-border/70 bg-background/85 p-2.5 text-xs shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Start</span>
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-gray-800 rounded-full border border-white"></div>
          <span>Finish</span>
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>Current</span>
        </div>
        {/* Only show the speed-gradient legend when the track is actually colored by
            speed. With no usable speed variation the track is a neutral single color,
            so a "Slow → Fast" gradient legend would be misleading. */}
        {hasSpeedVariation ? (
          <>
            <div className="text-muted-foreground mt-2">Speed colored track</div>
            <div className="mt-1 flex items-center gap-1">
              <span className="tabular-nums">{Math.round(speedRange.min)}</span>
              <div className="h-2 w-8 rounded bg-gradient-to-r from-blue-500 to-red-500"></div>
              <span className="tabular-nums">{Math.round(speedRange.max)}</span>
              <span className="text-muted-foreground">km/h</span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground mt-2">GPS track</div>
        )}
      </div>
      {data[currentTime] && (
        <div className="absolute bottom-3 left-3 rounded-lg border border-border/70 bg-background/85 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur">
          <div className="font-mono text-base font-semibold tabular-nums text-primary">{data[currentTime].speed?.toFixed(1)} km/h</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current Speed</div>
        </div>
      )}
      {mapStyle !== "offline" && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/75 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
          {MAP_ATTRIBUTION[mapStyle]}
        </div>
      )}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => zoomByButton(1)}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => zoomByButton(-1)}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={() => setView(null)}
          aria-label="Fit track to view"
          title="Fit track to view"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shadow-lg shadow-black/30"
          onClick={exportPng}
          aria-label="Save map as PNG"
          title="Save map as PNG"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
