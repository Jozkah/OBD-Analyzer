"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X } from "lucide-react"

interface MetricSelectorProps {
  availableMetrics: Array<{ key: string; label: string; unit: string; color: string }>
  selectedMetrics: string[]
  onMetricsChange: (metrics: string[]) => void
}

export function MetricSelector({ availableMetrics, selectedMetrics, onMetricsChange }: MetricSelectorProps) {
  const toggleMetric = (metricKey: string) => {
    if (selectedMetrics.includes(metricKey)) {
      onMetricsChange(selectedMetrics.filter((m) => m !== metricKey))
    } else {
      onMetricsChange([...selectedMetrics, metricKey])
    }
  }

  const clearAll = () => {
    onMetricsChange([])
  }

  const selectAll = () => {
    onMetricsChange(availableMetrics.map((m) => m.key))
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white">Select Metrics to Display</CardTitle>
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={selectAll} className="text-xs">
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll} className="text-xs">
              Clear All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {availableMetrics.map((metric) => {
            const isSelected = selectedMetrics.includes(metric.key)
            return (
              <Badge
                key={metric.key}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  isSelected ? "text-white" : "text-gray-300 border-gray-600 hover:border-gray-500"
                }`}
                style={isSelected ? { backgroundColor: metric.color, borderColor: metric.color } : {}}
                onClick={() => toggleMetric(metric.key)}
              >
                {metric.label} ({metric.unit})
                {isSelected && (
                  <X
                    className="h-3 w-3 ml-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMetric(metric.key)
                    }}
                  />
                )}
              </Badge>
            )
          })}
        </div>
        <div className="mt-3 text-sm text-gray-400">
          {selectedMetrics.length} of {availableMetrics.length} metrics selected
        </div>
      </CardContent>
    </Card>
  )
}
