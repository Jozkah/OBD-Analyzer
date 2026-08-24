"use client"

import React, { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Map as MapIcon, ChevronDown, MapPinOff, ParkingCircle, SignalLow } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/telemetry/section-header"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import { filterGpsFixes, isDegenerateTrack, classifyGpsCoverage } from "@/lib/gps"
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

  // Track shape classification (pure helpers, unit-tested in lib/gps.test.ts). A degenerate track
  // means fixes exist but the vehicle stayed within ~20 m — there is a location, but no route to
  // draw. Sparse means many samples lack a fix, so the drawn track may skip.
  const { degenerate, sparse } = useMemo(() => {
    const fixes = filterGpsFixes(data)
    return {
      degenerate: fixes.length > 0 && isDegenerateTrack(fixes, 20),
      sparse: classifyGpsCoverage(fixes.length, data.length) === "sparse",
    }
  }, [data])

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
          actions={
            <div className="flex items-center gap-2">
              {degenerate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                  <ParkingCircle className="h-3 w-3" aria-hidden="true" /> Stationary
                </span>
              )}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{gpsPointCount.toLocaleString()} fixes</span>
            </div>
          }
        />

        {/* Deliberate degenerate-track state: fixes exist but there is no path, so say so clearly at
            the workspace level (not just a floating label on the canvas) while keeping the map below
            for inspecting the single location. Theme-aware surface, restrained radius/shadow. */}
        {degenerate && (
          <div data-testid="route-stationary-note" className="mb-3 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
            <ParkingCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-foreground/90">Vehicle stationary — no route to draw</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                All <span className="tabular-nums text-foreground/80">{gpsPointCount.toLocaleString()}</span> GPS fixes sit within ~20&nbsp;m,
                so there is no path to plot. The last known position and its speed are marked on the map below; pan and zoom still work.
              </p>
            </div>
          </div>
        )}
        {!degenerate && sparse && (
          <div data-testid="route-sparse-note" className="mb-3 flex items-start gap-2.5 rounded-md border border-info/30 bg-info/10 px-3 py-2.5 text-sm">
            <SignalLow className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-foreground/90">Sparse GPS coverage</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fewer than half of the samples carry a location fix, so the drawn track may skip between fixes. The marker holds the last known position between them.
              </p>
            </div>
          </div>
        )}

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
