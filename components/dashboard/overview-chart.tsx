"use client"

import React from "react"
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts"
import { tooltipFormatter } from "@/lib/format"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import type { ChartXAxis } from "@/lib/chart-x"
import type { DataPoint, MetricConfig } from "@/types/obd"

interface OverviewChartProps {
  finalChartData: DataPoint[]
  enabledMetrics: MetricConfig[]
  idleZones: { x1: number; x2: number }[]
  effectiveXMode: "time" | "distance"
  chartTheme: ChartTheme
  xAxis: ChartXAxis
}

/**
 * Memoised so its reference stays stable across playback ticks — the parent re-renders every
 * frame while playing, but this Recharts subtree only re-renders when its own data/config
 * actually changes (#28).
 */
export const OverviewChart = React.memo(function OverviewChart({
  finalChartData, enabledMetrics, idleZones, effectiveXMode, chartTheme, xAxis,
}: OverviewChartProps) {
  const { grid, axis, tooltipContentStyle } = chartTheme
  const timeLabelFormatter = (v: unknown) => (effectiveXMode === "distance" ? `${Number(v).toFixed(2)} km` : xAxis.format(Number(v)))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} />
        {effectiveXMode === "distance" ? (
          <XAxis
            dataKey="dist"
            type="number"
            domain={["dataMin", "dataMax"]}
            stroke={axis}
            fontSize={12}
            tickFormatter={(v) => Number(v).toFixed(1)}
            label={{ value: "Distance (km)", position: "insideBottom", offset: -8, fill: axis, fontSize: 11 }}
          />
        ) : (
          <XAxis
            dataKey={xAxis.key}
            type="number"
            domain={["dataMin", "dataMax"]}
            stroke={axis}
            fontSize={12}
            tickFormatter={(v) => xAxis.format(Number(v))}
            label={{ value: xAxis.label, position: "insideBottom", offset: -8, fill: axis, fontSize: 11 }}
          />
        )}
        <YAxis stroke={axis} fontSize={12} />
        <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={timeLabelFormatter} />
        {enabledMetrics.map((metric) => (
          <Line
            key={metric.key as string}
            type="monotone"
            dataKey={metric.key as string}
            stroke={metric.color}
            strokeWidth={2}
            dot={false}
            name={`${metric.label} (${metric.unit})`}
          />
        ))}
        {effectiveXMode === "time" &&
          idleZones.map((zone, i) => (
            <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
})
