"use client"

import { useState, useMemo } from "react"
import { Resizable } from "react-resizable"
import { MetricChart } from "@/components/metric-chart"
import { TrackMap } from "@/components/track-map"
import { MetricSelector } from "@/components/metric-selector"
import { DataTable } from "@/components/data-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import "react-resizable/css/styles.css"

interface DashboardProps {
  data: any[]
}

export function Dashboard({ data }: DashboardProps) {
  const [selectedMetrics, setSelectedMetrics] = useState(["rpm", "speed", "throttle"])
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0)
  const [panelSizes, setPanelSizes] = useState({
    charts: { width: 800, height: 400 },
    map: { width: 600, height: 400 },
  })

  const availableMetrics = [
    { key: "rpm", label: "RPM", unit: "RPM", color: "#ef4444" },
    { key: "speed", label: "Speed", unit: "km/h", color: "#3b82f6" },
    { key: "throttle", label: "Throttle", unit: "%", color: "#10b981" },
    { key: "boost", label: "Boost", unit: "bar", color: "#f59e0b" },
    { key: "engineTemp", label: "Engine Temp", unit: "°C", color: "#ef4444" },
    { key: "fuelRate", label: "Fuel Rate", unit: "l/hr", color: "#8b5cf6" },
    { key: "enginePower", label: "Power", unit: "hp", color: "#06b6d4" },
    { key: "engineTorque", label: "Torque", unit: "N•m", color: "#f97316" },
  ]

  const currentData = useMemo(() => {
    if (currentTimeIndex < data.length) {
      return data[currentTimeIndex]
    }
    return data[0] || {}
  }, [data, currentTimeIndex])

  const stats = useMemo(() => {
    if (data.length === 0) return {}

    return {
      maxSpeed: Math.max(...data.map((d) => d.speed || 0)),
      maxRPM: Math.max(...data.map((d) => d.rpm || 0)),
      maxPower: Math.max(...data.map((d) => d.enginePower || 0)),
      avgFuelRate: data.reduce((sum, d) => sum + (d.fuelRate || 0), 0) / data.length,
    }
  }, [data])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Automotive Data Analyzer</h1>
            <p className="text-gray-400">{data.length} data points loaded</p>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="text-green-400 border-green-400">
              Max Speed: {stats.maxSpeed?.toFixed(0)} km/h
            </Badge>
            <Badge variant="outline" className="text-blue-400 border-blue-400">
              Max RPM: {stats.maxRPM?.toFixed(0)}
            </Badge>
            <Badge variant="outline" className="text-orange-400 border-orange-400">
              Max Power: {stats.maxPower?.toFixed(0)} hp
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Metric Selector */}
        <MetricSelector
          availableMetrics={availableMetrics}
          selectedMetrics={selectedMetrics}
          onMetricsChange={setSelectedMetrics}
        />

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Charts Panel */}
          <div className="xl:col-span-2">
            <Resizable
              width={panelSizes.charts.width}
              height={panelSizes.charts.height}
              onResize={(e, { size }) => {
                setPanelSizes((prev) => ({
                  ...prev,
                  charts: size,
                }))
              }}
              minConstraints={[400, 300]}
              maxConstraints={[1200, 800]}
            >
              <Card
                className="bg-gray-800 border-gray-700"
                style={{ width: panelSizes.charts.width, height: panelSizes.charts.height }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center justify-between">
                    Telemetry Data
                    <div className="text-sm text-gray-400">
                      Time: {currentData.timestamp?.toLocaleTimeString() || "N/A"}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-full">
                  <MetricChart
                    data={data}
                    selectedMetrics={selectedMetrics}
                    availableMetrics={availableMetrics}
                    onTimeIndexChange={setCurrentTimeIndex}
                    currentTimeIndex={currentTimeIndex}
                  />
                </CardContent>
              </Card>
            </Resizable>
          </div>

          {/* Map Panel */}
          <div>
            <Resizable
              width={panelSizes.map.width}
              height={panelSizes.map.height}
              onResize={(e, { size }) => {
                setPanelSizes((prev) => ({
                  ...prev,
                  map: size,
                }))
              }}
              minConstraints={[300, 300]}
              maxConstraints={[800, 600]}
            >
              <Card
                className="bg-gray-800 border-gray-700"
                style={{ width: panelSizes.map.width, height: panelSizes.map.height }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-white">Track Map</CardTitle>
                </CardHeader>
                <CardContent className="h-full">
                  <TrackMap data={data} currentTimeIndex={currentTimeIndex} onTimeIndexChange={setCurrentTimeIndex} />
                </CardContent>
              </Card>
            </Resizable>
          </div>
        </div>

        {/* Current Values Display */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {availableMetrics.map((metric) => (
            <Card key={metric.key} className="bg-gray-800 border-gray-700">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: metric.color }}>
                  {(currentData[metric.key] || 0).toFixed(1)}
                </div>
                <div className="text-sm text-gray-400">{metric.label}</div>
                <div className="text-xs text-gray-500">{metric.unit}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Data Table */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Raw Data</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={data.slice(0, 100)} /> {/* Show first 100 rows */}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
