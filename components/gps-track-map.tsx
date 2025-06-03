"use client"

import { useMemo, useState, useCallback, useRef } from "react"
import { GoogleMap, LoadScript, Marker, Polyline } from "@react-google-maps/api"
import { MapIcon } from "lucide-react"
import type { DataPoint } from "@/app/page" // Assuming DataPoint is exported from page.tsx
import { Button } from "@/components/ui/button"

interface GPSTrackMapProps {
  data: DataPoint[]
  currentTime: number
  onTimeChange?: (time: number) => void // Optional: if clicking map should change time
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
]

const libraries: ("geometry" | "drawing" | "places" | "visualization")[] = ["geometry"]

export function GPSTrackMap({ data, currentTime, onTimeChange }: GPSTrackMapProps) {
  const [mapType, setMapType] = useState<"satellite" | "roadmap" | "terrain">("satellite")
  const mapRef = useRef<google.maps.Map | null>(null)

  const gpsData = useMemo(() => {
    return data
      .map((item, index) => ({
        lat: item.latitude,
        lng: item.longitude,
        speed: item.speed || 0,
        time: item.time, // Keep original time/index for clicking
      }))
      .filter(
        (item) => typeof item.lat === "number" && typeof item.lng === "number" && item.lat !== 0 && item.lng !== 0,
      )
  }, [data])

  const bounds = useMemo(() => {
    if (gpsData.length === 0) return null
    const newBounds = new google.maps.LatLngBounds()
    gpsData.forEach((point) => newBounds.extend(new google.maps.LatLng(point.lat, point.lng)))
    return newBounds
  }, [gpsData])

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map
      if (bounds) {
        map.fitBounds(bounds)
      }
    },
    [bounds],
  )

  const currentPosition = useMemo(() => {
    const currentPoint = data[currentTime]
    if (currentPoint && typeof currentPoint.latitude === "number" && typeof currentPoint.longitude === "number") {
      return { lat: currentPoint.latitude, lng: currentPoint.longitude }
    }
    return null
  }, [data, currentTime])

  const startPosition = useMemo(() => {
    if (gpsData.length > 0) {
      return { lat: gpsData[0].lat, lng: gpsData[0].lng }
    }
    return null
  }, [gpsData])

  const finishPosition = useMemo(() => {
    if (gpsData.length > 1) {
      return { lat: gpsData[gpsData.length - 1].lat, lng: gpsData[gpsData.length - 1].lng }
    }
    return null
  }, [gpsData])

  const handleMapClick = useCallback(
    (event: google.maps.MapMouseEvent) => {
      if (!event.latLng || gpsData.length === 0 || !onTimeChange) return

      const clickedLat = event.latLng.lat()
      const clickedLng = event.latLng.lng()
      let closestTime = gpsData[0].time
      let minDistance = Number.POSITIVE_INFINITY

      gpsData.forEach((point) => {
        const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(clickedLat, clickedLng),
          new google.maps.LatLng(point.lat, point.lng),
        )
        if (distance < minDistance) {
          minDistance = distance
          closestTime = point.time
        }
      })
      onTimeChange(closestTime)
    },
    [gpsData, onTimeChange],
  )

  const maxSpeed = useMemo(() => Math.max(1, ...gpsData.map((p) => p.speed)), [gpsData])

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-400 bg-gray-800 p-4 rounded">
        <MapIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="font-semibold text-lg">Google Maps API Key Missing</p>
        <p className="text-sm text-center">Please provide `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in your .env.local file.</p>
      </div>
    )
  }

  if (gpsData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-800 p-4 rounded">
        <MapIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No GPS data available</p>
        <p className="text-sm">Upload a file with latitude and longitude data</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative">
      <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} libraries={libraries}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          options={{
            styles: mapType === "roadmap" ? undefined : darkMapStyle,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeId: mapType,
          }}
          onLoad={onMapLoad}
          onClick={onTimeChange ? handleMapClick : undefined}
        >
          {gpsData.map((point, index) => {
            if (index === gpsData.length - 1) return null // Last point has no next segment
            const nextPoint = gpsData[index + 1]
            const speedRatio = point.speed / maxSpeed
            const hue = (1 - speedRatio) * 120 // Green (120) to Red (0)
            return (
              <Polyline
                key={`segment-${index}`}
                path={[
                  { lat: point.lat, lng: point.lng },
                  { lat: nextPoint.lat, lng: nextPoint.lng },
                ]}
                options={{
                  strokeColor: `hsl(${hue}, 100%, 50%)`,
                  strokeOpacity: 0.8,
                  strokeWeight: 5,
                }}
              />
            )
          })}

          {startPosition && (
            <Marker
              position={startPosition}
              label={{ text: "S", color: "white", fontWeight: "bold" }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#22c55e",
                fillOpacity: 1,
                strokeWeight: 0,
              }}
            />
          )}
          {finishPosition && (
            <Marker
              position={finishPosition}
              label={{ text: "F", color: "white", fontWeight: "bold" }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#3b82f6", // Blue for finish
                fillOpacity: 1,
                strokeWeight: 0,
              }}
            />
          )}
          {currentPosition && (
            <Marker
              position={currentPosition}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#ef4444",
                fillOpacity: 1,
                strokeColor: "white",
                strokeWeight: 2,
              }}
            />
          )}
        </GoogleMap>
      </LoadScript>
      <div className="absolute top-2 left-2 bg-gray-800/90 rounded p-1.5 z-10">
        <div className="flex gap-1">
          {(["satellite", "roadmap", "terrain"] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={mapType === type ? "default" : "ghost"}
              onClick={() => setMapType(type)}
              className="text-xs px-2 py-1 h-7"
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <div className="absolute top-2 right-2 bg-gray-800/90 rounded p-2 text-xs z-10 space-y-1">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }}></div>
          <span>Start</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#3b82f6" }}></div>
          <span>Finish</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ef4444" }}></div>
          <span>Current</span>
        </div>
        <div className="text-gray-400 pt-1">Speed Color:</div>
        <div className="flex items-center space-x-1">
          <div className="w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded"></div>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>
      {data[currentTime] && (
        <div className="absolute bottom-2 left-2 bg-gray-800/90 rounded p-2 text-sm z-10">
          <div className="text-white font-bold">{data[currentTime].speed?.toFixed(1)} km/h</div>
          <div className="text-gray-400 text-xs">Current Speed</div>
        </div>
      )}
    </div>
  )
}
