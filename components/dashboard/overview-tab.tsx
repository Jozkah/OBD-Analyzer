"use client"

import React from "react"
import { Download, BarChart3, MapPin, Gauge } from "lucide-react"
import { Card } from "@/components/ui/card"
import { SectionHeader } from "@/components/telemetry/section-header"
import { Button } from "@/components/ui/button"
import { SessionSummary } from "./session-summary"
import { DataHealthPanel } from "./data-health-panel"
import { OverviewChart } from "./overview-chart"
import { ChannelPicker } from "./channel-picker"
import type { ChartTheme } from "@/lib/chart-theme"
import type { ChartXAxis } from "@/lib/chart-x"
import type { SessionMeta } from "@/lib/session-summary"
import type { HealthFinding } from "@/lib/data-health"
import type { AccelRun } from "@/lib/accel-runs"
import type { DataPoint, MetricConfig, TransmissionConfig } from "@/types/obd"

interface OverviewTabProps {
  meta: SessionMeta
  stats: React.ComponentProps<typeof SessionSummary>["stats"]
  tripTotals: React.ComponentProps<typeof SessionSummary>["tripTotals"]
  speedUnit: string
  importedFileNames: string[]
  transmissionConfig: TransmissionConfig
  healthFindings: HealthFinding[]
  /** Overview-specific dataset: downsampled against the active x-domain (distance in distance mode). */
  overviewChartData: DataPoint[]
  enabledMetrics: MetricConfig[]
  metrics: MetricConfig[]
  idleZones: { x1: number; x2: number }[]
  effectiveXMode: "time" | "distance"
  hasDistance: boolean
  overviewXMode: "time" | "distance"
  setOverviewXMode: (m: "time" | "distance") => void
  chartTheme: ChartTheme
  xAxis: ChartXAxis
  isEmptyPID: (m: MetricConfig) => boolean
  setMetricEnabled: (key: string, enabled: boolean) => void
  setEnabledMetricKeys: (keys: string[]) => void
  overviewChartRef: React.RefObject<HTMLDivElement>
  onExportChart: () => void
  accelRuns: AccelRun[]
  gpsPointCount: number
  onGoToRoute: () => void
}

export const OverviewTab = React.memo(function OverviewTab(props: OverviewTabProps) {
  const {
    meta, stats, tripTotals, speedUnit, importedFileNames, transmissionConfig, healthFindings,
    overviewChartData, enabledMetrics, metrics, idleZones, effectiveXMode, hasDistance, overviewXMode,
    setOverviewXMode, chartTheme, xAxis, isEmptyPID, setMetricEnabled, setEnabledMetricKeys, overviewChartRef,
    onExportChart, accelRuns, gpsPointCount, onGoToRoute,
  } = props

  return (
    <div className="space-y-4">
      <SessionSummary
        meta={meta}
        stats={stats}
        tripTotals={tripTotals}
        speedUnit={speedUnit}
        importedFileNames={importedFileNames}
        transmissionConfig={transmissionConfig}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="flex h-full min-h-[420px] flex-col p-5">
            <SectionHeader
              title="Telemetry Overview"
              hint="Plot any combination of channels. Use presets or add channels individually."
              actions={
                <div className="flex items-center gap-2">
                  {hasDistance && (
                    <div className="flex items-center rounded-md border border-border/80 p-0.5 text-[11px] font-medium" role="group" aria-label="Chart X axis">
                      <button
                        type="button"
                        onClick={() => setOverviewXMode("time")}
                        aria-pressed={effectiveXMode === "time"}
                        className={`rounded px-2 py-0.5 transition-colors ${effectiveXMode === "time" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverviewXMode("distance")}
                        aria-pressed={effectiveXMode === "distance"}
                        className={`rounded px-2 py-0.5 transition-colors ${effectiveXMode === "distance" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Distance
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onExportChart}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Export chart as PNG"
                    title="Export chart as PNG"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
              }
            />
            <div className="mb-4">
              <ChannelPicker
                metrics={metrics}
                enabledMetrics={enabledMetrics}
                isEmptyPID={isEmptyPID}
                setMetricEnabled={setMetricEnabled}
                setEnabledMetricKeys={setEnabledMetricKeys}
              />
            </div>
            <div ref={overviewChartRef} className="min-h-[300px] flex-grow">
              <OverviewChart
                finalChartData={overviewChartData}
                enabledMetrics={enabledMetrics}
                idleZones={idleZones}
                effectiveXMode={effectiveXMode}
                chartTheme={chartTheme}
                xAxis={xAxis}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <DataHealthPanel findings={healthFindings} />
        </div>
      </div>

      {/* Detected events + route preview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {accelRuns.length > 0 && (
          <Card className="p-5 lg:col-span-2">
            <SectionHeader title="Detected Acceleration Runs" icon={<Gauge className="h-4 w-4 text-muted-foreground" />} hint="Best runs timed from the log's per-sample timestamps." />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {accelRuns.map((run) => (
                <div key={run.label} className="rounded-lg border border-border/70 bg-secondary/40 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{run.label}</div>
                  <div className="font-mono text-2xl tabular-nums text-primary">{run.seconds.toFixed(2)}s</div>
                  {run.detail && <div className="text-xs text-muted-foreground">{run.detail}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card className={`p-5 ${accelRuns.length > 0 ? "" : "lg:col-span-3"}`}>
          <SectionHeader title="Route" icon={<MapPin className="h-4 w-4 text-muted-foreground" />} />
          {gpsPointCount > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                This log has <span className="font-mono tabular-nums text-foreground">{gpsPointCount.toLocaleString()}</span> GPS fixes.
              </p>
              <Button variant="outline" size="sm" className="self-start" onClick={onGoToRoute}>
                <MapPin className="mr-1.5 h-4 w-4" /> Open route map
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No GPS data in this log.</p>
          )}
        </Card>
      </div>
    </div>
  )
})
