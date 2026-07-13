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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { tooltipFormatter } from "@/lib/format"
import type { DataPoint } from "@/types/obd"

interface EngineChartsProps {
  finalChartData: DataPoint[]
  idleZones: { x1: number; x2: number }[]
  tempSensors: { key: string; label: string; color: string }[]
  tooltipContentStyle: React.CSSProperties
  selectedTempSensors: string[]
  setSelectedTempSensors: React.Dispatch<React.SetStateAction<string[]>>
}

export const EngineCharts = React.memo(function EngineCharts({
  finalChartData,
  idleZones,
  tempSensors,
  tooltipContentStyle,
  selectedTempSensors,
  setSelectedTempSensors,
}: EngineChartsProps) {
  return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-[1000px]">
                <Card className="p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Engine Temperature</h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Sensors
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="">
                        {tempSensors.map((sensor) => (
                          <DropdownMenuItem
                            key={sensor.key}
                            onClick={() => {
                              setSelectedTempSensors((prev) =>
                                prev.includes(sensor.key)
                                  ? prev.filter((s) => s !== sensor.key)
                                  : [...prev, sensor.key],
                              )
                            }}
                            className={selectedTempSensors.includes(sensor.key) ? "bg-accent" : ""}
                          >
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: sensor.color }}></div>
                              <span>{sensor.label}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        {selectedTempSensors.map((sensorKey) => {
                          const sensor = tempSensors.find((s) => s.key === sensorKey)
                          if (!sensor) return null
                          return (
                            <Area
                              key={sensorKey}
                              dataKey={sensorKey}
                              fill={sensor.color}
                              fillOpacity={0.3}
                              stroke={sensor.color}
                              name={`${sensor.label} (°C)`}
                              strokeWidth={2}
                            />
                          )
                        })}
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ignition Advance</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={["dataMin - 5", "dataMax + 5"]} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Line
                          dataKey="ignitionAdvance"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          name="Ignition Advance (°)"
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Boost Pressure</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={[(dataMin: number) => Math.min(dataMin - 0.2, -0.5), (dataMax: number) => Math.max(dataMax + 0.2, 0.5)]} tickFormatter={(v: number) => Number(v).toFixed(2)} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Line dataKey="boost" stroke="#06b6d4" strokeWidth={3} dot={false} name="Boost (bar)" />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fuel Consumption</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          dataKey="fuelRate"
                          fill="#f59e0b"
                          fillOpacity={0.3}
                          stroke="#f59e0b"
                          name="Fuel Rate (l/hr)"
                          strokeWidth={2}
                        />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="p-5 flex flex-col">
                  <h2 className="mb-4 flex-shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Throttle & Brake</h2>
                  <div className="flex-grow min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={finalChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222a3c" />
                        <XAxis dataKey="time" stroke="#7e899c" fontSize={12} />
                        <YAxis stroke="#7e899c" fontSize={12} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          formatter={tooltipFormatter}
                        />
                        <Area
                          dataKey="throttle"
                          fill="#22c55e"
                          fillOpacity={0.3}
                          stroke="#22c55e"
                          name="Throttle (%)"
                        />
                        <Area dataKey="brake" fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" name="Brake (%)" type="monotone" />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
  )
})
