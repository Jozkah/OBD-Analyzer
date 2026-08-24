"use client"

import { Card } from "@/components/ui/card"
import { StatCard, StatRow } from "@/components/telemetry/stat"
import { SectionHeader } from "@/components/telemetry/section-header"
import { AnimatedNumber } from "@/components/motion/animated-number"
import { formatDuration } from "@/lib/elapsed-time"
import { formatValue } from "@/lib/format"
import type { SessionMeta } from "@/lib/session-summary"
import type { TransmissionConfig } from "@/types/obd"

interface Stats {
  maxRPM: number; maxSpeed: number; maxBoost: number
  avgCoolant: number; avgIntakeTemp: number; avgSpeed: number; avgRPM: number
}
interface TripTotals {
  distance: number | null
  distanceSource?: "trip" | "integrated" | "none"
  duration: number | null
  fuel: number | null
  fuelUnit?: string
  fuelEconomy: number | null
}

interface SessionSummaryProps {
  meta: SessionMeta
  stats: Stats
  tripTotals: TripTotals
  speedUnit: string
  importedFileNames: string[]
  transmissionConfig: TransmissionConfig
}

export function SessionSummary({ meta, stats, tripTotals, speedUnit, importedFileNames, transmissionConfig }: SessionSummaryProps) {
  const duration = meta.durationSeconds != null ? formatDuration(meta.durationSeconds) : null
  const hasDistance = tripTotals.distance != null
  const distanceHint =
    tripTotals.distance == null
      ? "No trip-distance channel and no reliable timestamps to derive it"
      : tripTotals.distanceSource === "integrated"
        ? "Estimated from speed and elapsed time"
        : undefined
  const range = (r: { min: number; max: number } | null, unit: string) =>
    r ? `${Math.round(r.min)}–${Math.round(r.max)} ${unit}` : "—"

  return (
    <Card className="p-5">
      <SectionHeader title="Session Summary" hint="A quick read on this drive before you dig into the charts." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Duration" value={duration ?? "—"} accentClassName="text-primary" hint={duration ? undefined : "No reliable timestamps in this log"} />
        <StatCard
          label="Distance"
          value={hasDistance ? <AnimatedNumber value={tripTotals.distance} format={(n) => formatValue(n)} /> : "—"}
          unit={hasDistance ? "km" : undefined}
          hint={distanceHint}
        />
        <StatCard label="Max Speed" value={<AnimatedNumber value={stats.maxSpeed} format={(n) => formatValue(n, speedUnit)} />} unit={speedUnit} accentClassName="text-success" />
        <StatCard label="Max RPM" value={<AnimatedNumber value={stats.maxRPM} format={(n) => formatValue(n, "RPM")} />} accentClassName="text-danger" />
        <StatCard label="Avg Speed" value={<AnimatedNumber value={stats.avgSpeed} format={(n) => formatValue(n, speedUnit)} />} unit={speedUnit} />
        <StatCard label="Avg RPM" value={<AnimatedNumber value={stats.avgRPM} format={(n) => formatValue(n, "RPM")} />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm md:grid-cols-2 lg:grid-cols-3">
        {stats.maxBoost > 0 && <StatRow label="Boost peak" value={`${formatValue(stats.maxBoost, "bar")} bar`} />}
        <StatRow label="Coolant range" value={range(meta.coolantRange, "°C")} />
        <StatRow label="Intake range" value={range(meta.intakeRange, "°C")} />
        <StatRow label="Samples" value={meta.sampleCount.toLocaleString()} />
        <StatRow label="Sampling rate" value={meta.effectiveHz != null ? `${meta.effectiveHz.toFixed(1)} Hz` : "—"} />
        <StatRow label="Speed unit" value={speedUnit} />
        <StatRow label="GPS fixes" value={meta.gpsPointCount > 0 ? meta.gpsPointCount.toLocaleString() : "None"} />
        <StatRow
          label="Transmission"
          value={`${transmissionConfig.numberOfGears}-speed · FD ${transmissionConfig.finalDrive}`}
        />
        {tripTotals.fuelEconomy != null && (
          <StatRow label="Fuel economy" value={`${formatValue(tripTotals.fuelEconomy)} L/100km`} />
        )}
      </div>

      <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Source: </span>
        {importedFileNames.length > 0 ? importedFileNames.join(" → ") : "—"}
      </div>
    </Card>
  )
}
