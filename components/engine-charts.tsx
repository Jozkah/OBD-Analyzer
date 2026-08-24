"use client"

import React from "react"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SectionHeader } from "@/components/telemetry/section-header"
import { ChartEmptyState } from "@/components/telemetry/chart-empty-state"
import { tooltipFormatter } from "@/lib/format"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import type { ChartXAxis } from "@/lib/chart-x"
import type { DataPoint } from "@/types/obd"

interface EngineChartsProps {
  finalChartData: DataPoint[]
  idleZones: { x1: number; x2: number }[]
  tempSensors: { key: string; label: string; color: string }[]
  chartTheme: ChartTheme
  xAxis: ChartXAxis
  selectedTempSensors: string[]
  setSelectedTempSensors: React.Dispatch<React.SetStateAction<string[]>>
}

function hasChannel(data: DataPoint[], key: string): boolean {
  return data.some((d) => {
    const v = (d as Record<string, unknown>)[key]
    return typeof v === "number" && !isNaN(v) && v !== 0
  })
}

export const EngineCharts = React.memo(function EngineCharts({
  finalChartData,
  idleZones,
  tempSensors,
  chartTheme,
  xAxis,
  selectedTempSensors,
  setSelectedTempSensors,
}: EngineChartsProps) {
  const { grid, axis, tooltipContentStyle } = chartTheme
  const xProps = {
    dataKey: xAxis.key,
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as [string, string],
    stroke: axis,
    fontSize: 12,
    tickFormatter: (v: number) => xAxis.format(Number(v)),
  }
  const xTooltipLabel = (v: unknown) => `${xAxis.label}: ${xAxis.format(Number(v))}`
  const idleBand = (yAxisId?: string) =>
    idleZones.map((zone, i) => (
      <ReferenceArea
        key={`idle-${i}`}
        x1={zone.x1}
        x2={zone.x2}
        yAxisId={yAxisId}
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
          title="Engine Temperature"
          hint="Coolant, intake and any other temperature channels present in the log."
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8" disabled={tempSensors.length === 0}>
                  <ChevronDown className="mr-1 h-4 w-4" />
                  Sensors
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tempSensors.map((sensor) => (
                  <DropdownMenuCheckboxItem
                    key={sensor.key}
                    checked={selectedTempSensors.includes(sensor.key)}
                    onCheckedChange={() =>
                      setSelectedTempSensors((prev) =>
                        prev.includes(sensor.key) ? prev.filter((s) => s !== sensor.key) : [...prev, sensor.key],
                      )
                    }
                  >
                    <span className="mr-2 inline-block h-3 w-3 rounded" style={{ backgroundColor: sensor.color }} />
                    {sensor.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        <div className="min-h-[280px] flex-grow">
          {tempSensors.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis stroke={axis} fontSize={12} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                {selectedTempSensors.map((sensorKey) => {
                  const sensor = tempSensors.find((s) => s.key === sensorKey)
                  if (!sensor) return null
                  return (
                    <Area key={sensorKey} dataKey={sensorKey} fill={sensor.color} fillOpacity={0.3} stroke={sensor.color} name={`${sensor.label} (°C)`} strokeWidth={2} />
                  )
                })}
                {idleBand()}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No temperature channels in this log." hint="Enable coolant/intake temperature PIDs in your logger." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader title="Ignition Advance" hint="Spark timing advance in degrees." />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "ignitionAdvance") ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis stroke={axis} fontSize={12} domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Line dataKey="ignitionAdvance" stroke={TELEMETRY.ignition} strokeWidth={2} dot={false} name="Ignition Advance (°)" />
                {idleBand()}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Ignition Advance channel in this log." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader title="Boost Pressure" hint="Manifold boost/vacuum relative to atmospheric." />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "boost") ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis stroke={axis} fontSize={12} domain={[(dataMin: number) => Math.min(dataMin - 0.2, -0.5), (dataMax: number) => Math.max(dataMax + 0.2, 0.5)]} tickFormatter={(v: number) => Number(v).toFixed(2)} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Line dataKey="boost" stroke={TELEMETRY.boost} strokeWidth={3} dot={false} name="Boost (bar)" />
                {idleBand()}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Boost/MAP channel in this log." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm">
        <SectionHeader title="Fuel Consumption" hint="Instantaneous fuel rate in litres per hour." />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "fuelRate") ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis stroke={axis} fontSize={12} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Area dataKey="fuelRate" fill={TELEMETRY.fuel} fillOpacity={0.3} stroke={TELEMETRY.fuel} name="Fuel Rate (l/hr)" strokeWidth={2} />
                {idleBand()}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Fuel Rate channel in this log." />
          )}
        </div>
      </Card>

      <Card className="flex min-h-[360px] flex-col p-5 shadow-sm xl:col-span-2">
        <SectionHeader title="Throttle & Brake" hint="Pedal inputs — throttle and brake position." />
        <div className="min-h-[280px] flex-grow">
          {hasChannel(finalChartData, "throttle") || hasChannel(finalChartData, "brake") ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis {...xProps} />
                <YAxis stroke={axis} fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={xTooltipLabel} />
                <Area dataKey="throttle" fill={TELEMETRY.speed} fillOpacity={0.3} stroke={TELEMETRY.speed} name="Throttle (%)" />
                <Area dataKey="brake" fill={TELEMETRY.idle} fillOpacity={0.3} stroke={TELEMETRY.idle} name="Brake (%)" type="monotone" />
                {idleBand()}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No Throttle or Brake channels in this log." />
          )}
        </div>
      </Card>
    </div>
  )
})
