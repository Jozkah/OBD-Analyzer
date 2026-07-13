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
import { tooltipFormatter } from "@/lib/format"
import type { DataPoint, TransmissionConfig } from "@/types/obd"

interface PerformanceChartsProps {
  finalChartData: DataPoint[]
  gearDistribution: { gear: number; count: number; percentage: string }[]
  idleZones: { x1: number; x2: number }[]
  speedUnit: "km/h" | "mph"
  tooltipContentStyle: React.CSSProperties
  transmissionConfig: TransmissionConfig
}

export const PerformanceCharts = React.memo(function PerformanceCharts({
  finalChartData,
  gearDistribution,
  idleZones,
  speedUnit,
  tooltipContentStyle,
  transmissionConfig,
}: PerformanceChartsProps) {
  return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-[1000px]">
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">RPM vs Speed Analysis</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="rpm" stroke="#ef4444" fontSize={12} orientation="left" label={{ value: "RPM", angle: -90, position: "insideLeft", fill: "#ef4444", fontSize: 11 }} />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Line yAxisId="rpm" dataKey="rpm" stroke="#ef4444" strokeWidth={2} dot={false} name="RPM" />
                        <Line
                          yAxisId="speed"
                          dataKey="speed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name={`Speed (${speedUnit})`}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="rpm" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Throttle vs Speed</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="throttle" stroke="#eab308" fontSize={12} orientation="left" label={{ value: "Throttle %", angle: -90, position: "insideLeft", fill: "#eab308", fontSize: 11 }} />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="right" label={{ value: "Speed", angle: 90, position: "insideRight", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Line
                          yAxisId="throttle"
                          dataKey="throttle"
                          stroke="#eab308"
                          strokeWidth={2}
                          dot={false}
                          name="Throttle"
                        />
                        <Line
                          yAxisId="speed"
                          dataKey="speed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name={`Speed (${speedUnit})`}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="throttle" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Power & Torque</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis yAxisId="left" stroke="#ec4899" orientation="left" label={{ value: "Power (hp)", angle: -90, position: "insideLeft", fill: "#ec4899", fontSize: 11 }} />
                        <YAxis yAxisId="right" stroke="#84cc16" orientation="right" label={{ value: "Torque (N·m)", angle: 90, position: "insideRight", fill: "#84cc16", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          yAxisId="left"
                          dataKey="enginePower"
                          fill="#ec4899"
                          fillOpacity={0.3}
                          stroke="#ec4899"
                          name="Power (hp)"
                        />
                        <Line
                          yAxisId="right"
                          dataKey="engineTorque"
                          stroke="#84cc16"
                          strokeWidth={2}
                          dot={false}
                          name="Torque (N•m)"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="left" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gearbox Usage</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis
                          yAxisId="gear"
                          stroke="#b666d2"
                          fontSize={12}
                          domain={[0.5, transmissionConfig.numberOfGears + 0.5]}
                          ticks={Array.from({ length: transmissionConfig.numberOfGears }, (_, i) => i + 1)}
                          allowDataOverflow={true}
                          orientation="right"
                          label={{ value: "Gear", angle: 90, position: "insideRight", fill: "#b666d2", fontSize: 11 }}
                        />
                        <YAxis yAxisId="speed" stroke="#22c55e" fontSize={12} orientation="left" label={{ value: "Speed", angle: -90, position: "insideLeft", fill: "#22c55e", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={(value: any, name: any) => {
                            if (name === "gear") {
                              // Clamp to the configured gear count, not a hard-coded 6, so
                              // 7-speed (and higher) transmissions show their top gear.
                              const gear = Math.min(transmissionConfig.numberOfGears, Math.max(1, Number(value)))
                              return [`${gear}`, "Gear"]
                            }
                            return [`${value} ${speedUnit}`, "Speed"]
                          }}
                        />
                        <Line
                          yAxisId="gear"
                          dataKey={(data: any) => Math.min(transmissionConfig.numberOfGears, Math.max(1, data.gear || 1))}
                          stroke="#b666d2"
                          strokeWidth={2}
                          dot={false}
                          name="gear"
                          connectNulls
                        />
                        <Area
                          yAxisId="speed"
                          dataKey="speed"
                          fill="#22c55e"
                          fillOpacity={0.3}
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          name="speed"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} yAxisId="gear" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gear Distribution</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={gearDistribution}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="gear" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} allowDecimals={false} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={(value: any, name: any, props: any) => [
                            `${value} samples (${props.payload.percentage}%)`,
                            `Gear ${props.payload.gear}`,
                          ]}
                        />
                        <Bar dataKey="count" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
  )
})
