"use client"

import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from "recharts"

interface MetricChartProps {
  data: any[]
  selectedMetrics: string[]
  availableMetrics: Array<{ key: string; label: string; unit: string; color: string }>
  onTimeIndexChange: (index: number) => void
  currentTimeIndex: number
}

export function MetricChart({
  data,
  selectedMetrics,
  availableMetrics,
  onTimeIndexChange,
  currentTimeIndex,
}: MetricChartProps) {
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      index,
      time: item.timestamp?.toLocaleTimeString() || index.toString(),
      ...selectedMetrics.reduce((acc, metric) => {
        acc[metric] = item[metric] || 0
        return acc
      }, {} as any),
    }))
  }, [data, selectedMetrics])

  const handleBrushChange = (brushData: any) => {
    if (brushData && brushData.startIndex !== undefined) {
      onTimeIndexChange(brushData.startIndex)
    }
  }

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} interval="preserveStartEnd" />
          <YAxis stroke="#9ca3af" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "6px",
              color: "#fff",
            }}
          />
          <Legend />
          {selectedMetrics.map((metric) => {
            const metricConfig = availableMetrics.find((m) => m.key === metric)
            return (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={metricConfig?.color || "#3b82f6"}
                strokeWidth={2}
                dot={false}
                name={`${metricConfig?.label} (${metricConfig?.unit})`}
              />
            )
          })}
          <Brush dataKey="time" height={30} stroke="#3b82f6" fill="#1f2937" onChange={handleBrushChange} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
