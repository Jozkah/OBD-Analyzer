"use client"

import type React from "react"

import { useMemo, useEffect, useRef } from "react"

interface TrackMapProps {
  data: any[]
  currentTimeIndex: number
  onTimeIndexChange: (index: number) => void
}

export function TrackMap({ data, currentTimeIndex, onTimeIndexChange }: TrackMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const gpsData = useMemo(() => {
    return data
      .filter((item) => item.latitude && item.longitude && item.latitude !== 0 && item.longitude !== 0)
      .map((item, index) => ({
        lat: item.latitude,
        lng: item.longitude,
        speed: item.speed || 0,
        originalIndex: data.indexOf(item),
      }))
  }, [data])

  const bounds = useMemo(() => {
    if (gpsData.length === 0) return null

    const lats = gpsData.map((p) => p.lat)
    const lngs = gpsData.map((p) => p.lng)

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    }
  }, [gpsData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bounds || gpsData.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const width = rect.width
    const height = rect.height
    const padding = 20

    // Clear canvas
    ctx.fillStyle = "#111827"
    ctx.fillRect(0, 0, width, height)

    // Calculate scale
    const latRange = bounds.maxLat - bounds.minLat
    const lngRange = bounds.maxLng - bounds.minLng
    const scaleX = (width - 2 * padding) / lngRange
    const scaleY = (height - 2 * padding) / latRange

    // Convert GPS to canvas coordinates
    const toCanvasCoords = (lat: number, lng: number) => ({
      x: padding + (lng - bounds.minLng) * scaleX,
      y: height - padding - (lat - bounds.minLat) * scaleY,
    })

    // Draw track
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 3
    ctx.beginPath()

    gpsData.forEach((point, index) => {
      const coords = toCanvasCoords(point.lat, point.lng)
      if (index === 0) {
        ctx.moveTo(coords.x, coords.y)
      } else {
        ctx.lineTo(coords.x, coords.y)
      }
    })
    ctx.stroke()

    // Draw speed-colored segments
    for (let i = 0; i < gpsData.length - 1; i++) {
      const point1 = gpsData[i]
      const point2 = gpsData[i + 1]
      const coords1 = toCanvasCoords(point1.lat, point1.lng)
      const coords2 = toCanvasCoords(point2.lat, point2.lng)

      // Color based on speed
      const maxSpeed = Math.max(...gpsData.map((p) => p.speed))
      const speedRatio = point1.speed / maxSpeed
      const red = Math.floor(255 * speedRatio)
      const green = Math.floor(255 * (1 - speedRatio))

      ctx.strokeStyle = `rgb(${red}, ${green}, 0)`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(coords1.x, coords1.y)
      ctx.lineTo(coords2.x, coords2.y)
      ctx.stroke()
    }

    // Draw current position
    if (currentTimeIndex < gpsData.length) {
      const currentPoint = gpsData.find((p) => p.originalIndex <= currentTimeIndex)
      if (currentPoint) {
        const coords = toCanvasCoords(currentPoint.lat, currentPoint.lng)
        ctx.fillStyle = "#ef4444"
        ctx.beginPath()
        ctx.arc(coords.x, coords.y, 6, 0, 2 * Math.PI)
        ctx.fill()

        // Draw outer ring
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(coords.x, coords.y, 8, 0, 2 * Math.PI)
        ctx.stroke()
      }
    }

    // Draw start/finish markers
    if (gpsData.length > 0) {
      const startCoords = toCanvasCoords(gpsData[0].lat, gpsData[0].lng)
      const endCoords = toCanvasCoords(gpsData[gpsData.length - 1].lat, gpsData[gpsData.length - 1].lng)

      // Start marker (green)
      ctx.fillStyle = "#10b981"
      ctx.beginPath()
      ctx.arc(startCoords.x, startCoords.y, 5, 0, 2 * Math.PI)
      ctx.fill()

      // End marker (red)
      ctx.fillStyle = "#ef4444"
      ctx.beginPath()
      ctx.arc(endCoords.x, endCoords.y, 5, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [gpsData, bounds, currentTimeIndex])

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!bounds || gpsData.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const padding = 20
    const latRange = bounds.maxLat - bounds.minLat
    const lngRange = bounds.maxLng - bounds.minLng
    const scaleX = (rect.width - 2 * padding) / lngRange
    const scaleY = (rect.height - 2 * padding) / latRange

    // Find closest point
    let closestIndex = 0
    let minDistance = Number.POSITIVE_INFINITY

    gpsData.forEach((point, index) => {
      const canvasX = padding + (point.lng - bounds.minLng) * scaleX
      const canvasY = rect.height - padding - (point.lat - bounds.minLat) * scaleY
      const distance = Math.sqrt((x - canvasX) ** 2 + (y - canvasY) ** 2)

      if (distance < minDistance) {
        minDistance = distance
        closestIndex = point.originalIndex
      }
    })

    onTimeIndexChange(closestIndex)
  }

  if (gpsData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p>No GPS data available</p>
          <p className="text-sm">Upload a file with latitude and longitude data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <canvas ref={canvasRef} className="w-full h-full cursor-pointer" onClick={handleCanvasClick} />
      <div className="absolute top-2 right-2 bg-gray-800 rounded p-2 text-xs">
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Start</span>
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>End/Current</span>
        </div>
        <div className="text-gray-400">Click to navigate</div>
      </div>
    </div>
  )
}
