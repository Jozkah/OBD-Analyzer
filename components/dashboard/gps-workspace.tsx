"use client"

import React, { useState } from "react"
import dynamic from "next/dynamic"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Map as MapIcon, ChevronDown, MapPinOff } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/telemetry/section-header"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import type { DataPoint } from "@/types/obd"

const GPSTrackMap = dynamic(() => import("@/components/gps-track-map").then((m) => m.GPSTrackMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>,
})

interface GpsWorkspaceProps {
  data: DataPoint[]
  currentTime: number
  gpsPointCount: number
  elevationData: { dist: number; time: number; altitude: number }[]
  chartTheme: ChartTheme
  theme: "light" | "dark"
  speedUnit: "km/h" | "mph"
  onNotify: (msg: string) => void
}

export const GpsWorkspace = React.memo(function GpsWorkspace({
  data, currentTime, gpsPointCount, elevationData, chartTheme, theme, speedUnit, onNotify,
}: GpsWorkspaceProps) {
  const [showElevation, setShowElevation] = useState(true)
  const { grid, axis, tooltipContentStyle } = chartTheme

  if (gpsPointCount === 0) {
    return (
      <Card className="p-5 shadow-sm">
        <SectionHeader title="Route" icon={<MapIcon className="h-4 w-4 text-muted-foreground" />} />
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <MapPinOff className="h-10 w-10 opacity-40" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/80">No GPS data in this log</p>
          <p className="max-w-sm text-xs">Enable GPS/location logging in your OBD app to see the route, speed colouring and elevation profile here.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col p-4 shadow-sm">
        <SectionHeader
          title="Route Map"
          icon={<MapIcon className="h-4 w-4 text-muted-foreground" />}
          hint="Pan, zoom and switch basemaps. Online basemaps are opt-in; offline stays fully local."
          actions={<span className="font-mono text-xs tabular-nums text-muted-foreground">{gpsPointCount.toLocaleString()} fixes</span>}
        />
        {/* Responsive map surface — fills available viewport height instead of a fixed 1000px. */}
        <div className="h-[58vh] min-h-[420px] w-full">
          <GPSTrackMap data={data} currentTime={currentTime} onNotify={onNotify} theme={theme} speedUnit={speedUnit} />
        </div>
      </Card>

      {elevationData.length > 1 && (
        <Card className="p-5 shadow-sm">
          <SectionHeader
            title="Elevation Profile"
            hint="Altitude against distance travelled."
            actions={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowElevation((s) => !s)} aria-expanded={showElevation}>
                <ChevronDown className={`mr-1 h-4 w-4 transition-transform ${showElevation ? "" : "-rotate-90"}`} />
                {showElevation ? "Hide" : "Show"}
              </Button>
            }
          />
          {showElevation && (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={elevationData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TELEMETRY.altitude} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={TELEMETRY.altitude} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="dist" type="number" domain={["dataMin", "dataMax"]} stroke={axis} fontSize={12} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: "Distance (km)", position: "insideBottom", offset: -8, fill: axis, fontSize: 11 }} />
                  <YAxis stroke={axis} fontSize={12} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v) => Math.round(Number(v)).toString()} label={{ value: "Altitude (m)", angle: -90, position: "insideLeft", fill: axis, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipContentStyle} formatter={(value) => [`${Math.round(Number(value))} m`, "Altitude"]} labelFormatter={(v) => `${Number(v).toFixed(2)} km`} />
                  <Area type="monotone" dataKey="altitude" stroke={TELEMETRY.altitude} strokeWidth={2} fill="url(#elevationFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      )}
    </div>
  )
})
