"use client"

import React from "react"
import {
  ComposedChart,
  Line,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts"
import { Card } from "@/components/ui/card"
import { SectionHeader } from "@/components/telemetry/section-header"
import { ChartEmptyState } from "@/components/telemetry/chart-empty-state"
import { tooltipFormatter } from "@/lib/format"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import type { ChartXAxis } from "@/lib/chart-x"
import type { DataPoint, TransmissionConfig } from "@/types/obd"

interface PerformanceChartsProps {
  finalChartData: DataPoint[]
  gearDistribution: { gear: number; count: number; percentage: string }[]
  idleZones: { x1: number; x2: number }[]
  speedUnit: "km/h" | "mph"
  chartTheme: ChartTheme
  xAxis: ChartXAxis
  transmissionConfig: TransmissionConfig
}

// Does any row carry a finite, non-zero value for `key`? Used to show a helpful empty state
// instead of a flat zero line when the log doesn't include the required channel.
function hasChannel(data: DataPoint[], key: string): boolean {
  return data.some((d) => {
    const v = (d as Record<string, unknown>)[key]
    return typeof v === "number" && !isNaN(v) && v !== 0
  })
}

export const PerformanceCharts = React.memo(function PerformanceCharts({
  finalChartData,
  gearDistribution,
  idleZones,
  speedUnit,
  chartTheme,
  xAxis,
  transmissionConfig,
}: PerformanceChartsProps) {
  const { grid, axis, tooltipContentStyle } = chartTheme
  // Shared time/sample x-axis (elapsed seconds when trustworthy, else sample index).
  const xProps = {
    dataKey: xAxis.key,
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as [string, string],
    stroke: axis,
    fontSize: 12,
    tickFormatter: (v: number) => xAxis.format(Number(v)),
  }
  const xTooltipLabel = (v: unknown) => `${xAxis.label}: ${xAxis.format(Number(v))}`
  const idleBands = idleZones.map((zone, i) => (
    <ReferenceArea
      key={`idle-${i}`}
      x1={zone.x1}
      x2={zone.x2}
      fill={TELEMETRY.idle}
      fillOpacity={0.08}
      stroke={TELEMETRY.idle}
      strokeOpacity={0.2}
      strokeDasharray="4 4"
    />
  ))

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader
          title="RPM vs Speed"
          hint="Engine speed against road speed over the session — the shape of each pull and shift."
        />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "rpm") || hasChannel(finalChartData, "speed") ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis yAxisId="rpm" stroke={axis} fontSize={12} orientation="left" label={{ value: "RPM", angle: -90, position: "insideLeft", fill: TELEMETRY.rpm, fontSize: 11 }} />
                <YAxis yAxisId="speed" stroke={axis} fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: TELEMETRY.speed, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Line yAxisId="rpm" dataKey="rpm" stroke={TELEMETRY.rpm} strokeWidth={2} dot={false} name="RPM" />
                <Line yAxisId="speed" dataKey="speed" stroke={TELEMETRY.speed} strokeWidth={2} dot={false} name={`Speed (${speedUnit})`} />
                {idleZones.map((zone, i) => (
                  <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="rpm" fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="Needs RPM or Speed channels." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader
          title="Throttle vs Speed"
          hint="Driver throttle input against the speed it produced."
        />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "throttle") ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis yAxisId="throttle" stroke={axis} fontSize={12} orientation="left" label={{ value: "Throttle %", angle: -90, position: "insideLeft", fill: TELEMETRY.throttle, fontSize: 11 }} />
                <YAxis yAxisId="speed" stroke={axis} fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: TELEMETRY.speed, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Line yAxisId="throttle" dataKey="throttle" stroke={TELEMETRY.throttle} strokeWidth={2} dot={false} name="Throttle" />
                <Line yAxisId="speed" dataKey="speed" stroke={TELEMETRY.speed} strokeWidth={2} dot={false} name={`Speed (${speedUnit})`} />
                {idleZones.map((zone, i) => (
                  <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="throttle" fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Throttle Position channel in this log." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader
          title="Power & Torque"
          hint="Calculated engine output. Requires power/torque PIDs (or values derived from them)."
        />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "enginePower") || hasChannel(finalChartData, "engineTorque") ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis yAxisId="left" stroke={axis} fontSize={12} orientation="left" label={{ value: "Power (hp)", angle: -90, position: "insideLeft", fill: TELEMETRY.power, fontSize: 11 }} />
                <YAxis yAxisId="right" stroke={axis} fontSize={12} orientation="right" label={{ value: "Torque (N·m)", angle: 90, position: "insideRight", fill: TELEMETRY.torque, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Area yAxisId="left" dataKey="enginePower" fill={TELEMETRY.power} fillOpacity={0.3} stroke={TELEMETRY.power} name="Power (hp)" />
                <Line yAxisId="right" dataKey="engineTorque" stroke={TELEMETRY.torque} strokeWidth={2} dot={false} name="Torque (N•m)" />
                {idleZones.map((zone, i) => (
                  <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="left" fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Power or Torque channels in this log." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader
          title="Gearbox Usage"
          hint="Estimated gear against speed. Gear is derived from the transmission configuration."
        />
        <div className="min-h-[280px] flex-grow">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis {...xProps} />
              <YAxis
                yAxisId="gear"
                stroke={axis}
                fontSize={12}
                domain={[0.5, transmissionConfig.numberOfGears + 0.5]}
                ticks={Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1)}
                allowDataOverflow={true}
                orientation="right"
                label={{ value: "Gear", angle: 90, position: "insideRight", fill: TELEMETRY.gear, fontSize: 11 }}
              />
              <YAxis yAxisId="speed" stroke={axis} fontSize={12} orientation="left" label={{ value: "Speed", angle: -90, position: "insideLeft", fill: TELEMETRY.speed, fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelFormatter={xTooltipLabel}
                formatter={((value: number | string, name: string) => {
                  if (name === "gear") {
                    const gear = Math.min(transmissionConfig.numberOfGears, Math.max(1, Number(value)))
                    return [`${gear}`, "Gear"]
                  }
                  return [`${value} ${speedUnit}`, "Speed"]
                }) as never}
              />
              <Line
                yAxisId="gear"
                dataKey={(data: DataPoint) => Math.min(transmissionConfig.numberOfGears, Math.max(1, data.gear || 1))}
                stroke={TELEMETRY.gear}
                strokeWidth={2}
                dot={false}
                name="gear"
                connectNulls
              />
              <Area yAxisId="speed" dataKey="speed" fill={TELEMETRY.speed} fillOpacity={0.3} stroke={TELEMETRY.speed} strokeWidth={2} dot={false} name="speed" />
              {idleZones.map((zone, i) => (
                <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="gear" fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm xl:col-span-2">
        <SectionHeader title="Gear Distribution" hint="How many samples were spent in each gear." />
        <div className="min-h-[280px] flex-grow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gearDistribution} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="gear" stroke={axis} fontSize={12} />
              <YAxis stroke={axis} fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipContentStyle}
                formatter={((value: number | string, _name: string, props: { payload: { percentage: string; gear: number } }) => [
                  `${value} samples (${props.payload.percentage}%)`,
                  `Gear ${props.payload.gear}`,
                ]) as never}
              />
              <Bar dataKey="count" fill={TELEMETRY.speed} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
})
