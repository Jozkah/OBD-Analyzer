"use client"

import dynamic from "next/dynamic"
import { Share2 } from "lucide-react"
import { ErrorBoundary } from "@/components/error-boundary"
import { useObdSession, SHARING_ENABLED } from "@/hooks/use-obd-session"
import { calculateGear, getShiftIndicator } from "@/lib/gear"
import { exportChartPng } from "@/lib/chart-export"
import { AppHeader } from "./app-header"
import { SideNav } from "./side-nav"
import { BottomNav } from "./bottom-nav"
import { PlaybackBar } from "./playback-bar"
import { UploadScreen } from "./upload-screen"
import { OverviewTab } from "./overview-tab"
import { ChannelsExplorer } from "./channels-explorer"
import { GpsWorkspace } from "./gps-workspace"
import { TransmissionDialog } from "./transmission-dialog"
import { MissingPidsDialog } from "./missing-pids-dialog"
import { ShareLinkDialog, SharePromptDialog } from "./share-dialogs"
import { Toast } from "./toast"
import { ChartEmptyState } from "@/components/telemetry/chart-empty-state"
import { useState } from "react"

const chartTabFallback = () => (
  <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">Loading charts…</div>
)
const PerformanceCharts = dynamic(() => import("@/components/performance-charts").then((m) => m.PerformanceCharts), { ssr: false, loading: chartTabFallback })
const EngineCharts = dynamic(() => import("@/components/engine-charts").then((m) => m.EngineCharts), { ssr: false, loading: chartTabFallback })

export function Dashboard() {
  const s = useObdSession()
  const [transmissionOpen, setTransmissionOpen] = useState(false)
  const hasData = s.data.length > 0
  const lastIndex = Math.max(0, s.data.length - 1)

  const currentGearNum = s.currentDataPoint
    ? calculateGear(s.currentDataPoint.speed, s.currentDataPoint.rpm, s.transmissionConfig, s.speedUnit)
    : null
  const currentGear: number | string = currentGearNum ?? "N/A"
  // Shift recommendation for the playback bar (only when a gear could be derived).
  const shift =
    s.currentDataPoint && currentGearNum != null
      ? getShiftIndicator(s.currentDataPoint.rpm, currentGearNum, s.transmissionConfig)
      : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        fileName={s.selectedFile?.name ?? null}
        fileCount={s.importedFileNames.length}
        recordCount={s.data.length}
        speedUnit={s.speedUnit}
        hasData={hasData}
        theme={s.theme}
        sharingEnabled={SHARING_ENABLED}
        isSharing={s.isSharing}
        onLoadClick={() => s.fileInputRef.current?.click()}
        onLoadSample={s.loadSampleData}
        onExport={s.handleExportCsv}
        onShare={s.handleShare}
        onOpenTransmission={() => hasData && setTransmissionOpen(true)}
        onToggleTheme={s.toggleTheme}
      />
      <input ref={s.fileInputRef} type="file" accept=".csv" multiple onChange={s.handleFileUpload} className="hidden" />

      <div className="flex">
        {hasData && (
          <SideNav
            activeTab={s.activeTab}
            onSelect={s.setActiveTab}
            onOpenSettings={() => setTransmissionOpen(true)}
            settingsDisabled={!hasData}
          />
        )}

        <div className="min-w-0 flex-1">
          {hasData && (
            <PlaybackBar
              currentTime={s.currentTime}
              setCurrentTime={s.setCurrentTime}
              timeRange={s.timeRange}
              setTimeRange={s.setTimeRange}
              lastIndex={lastIndex}
              timeAxis={s.timeAxis}
              isPlaying={s.isPlaying}
              setIsPlaying={s.setIsPlaying}
              playbackRate={s.playbackRate}
              setPlaybackRate={s.setPlaybackRate}
              ignoreIdle={s.ignoreIdle}
              setIgnoreIdle={s.setIgnoreIdle}
              currentDataPoint={s.currentDataPoint}
              gear={currentGear}
              shift={shift}
              speedUnit={s.speedUnit}
            />
          )}

          <main className="w-full px-4 py-5 pb-24 lg:px-6 md:pb-8">
            {s.sharedNotice && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm text-foreground/80">
                <Share2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-medium text-foreground/90">You&rsquo;re viewing a shared log.</span>
                {s.sharedNotice.expiresAt && (
                  <span className="text-muted-foreground">This link expires {new Date(s.sharedNotice.expiresAt).toLocaleString()}.</span>
                )}
              </div>
            )}

            {s.isLoading && (
              <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-5 py-24 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
                <div className="text-sm font-medium text-muted-foreground">Loading and parsing data…</div>
              </div>
            )}

            {!hasData && !s.isLoading && (
              <UploadScreen
                isDragOver={s.isDragOver}
                onDrop={s.handleDrop}
                onDragOver={s.handleDragOver}
                onDragLeave={s.handleDragLeave}
                onChooseFiles={() => s.fileInputRef.current?.click()}
                onLoadSample={s.loadSampleData}
              />
            )}

            {hasData && (
              <>
                {s.activeTab === "overview" && (
                  <OverviewTab
                    meta={s.sessionMeta}
                    stats={s.stats}
                    tripTotals={s.tripTotals}
                    speedUnit={s.speedUnit}
                    importedFileNames={s.importedFileNames}
                    transmissionConfig={s.transmissionConfig}
                    healthFindings={s.healthFindings}
                    overviewChartData={s.overviewChartData}
                    enabledMetrics={s.enabledMetrics}
                    metrics={s.metrics}
                    idleZones={s.idleZones}
                    effectiveXMode={s.effectiveXMode}
                    hasDistance={s.hasDistance}
                    overviewXMode={s.overviewXMode}
                    setOverviewXMode={s.setOverviewXMode}
                    chartTheme={s.chartTheme}
                    xAxis={s.chartXAxis}
                    isEmptyPID={s.isEmptyPID}
                    setMetricEnabled={s.setMetricEnabled}
                    setEnabledMetricKeys={s.setEnabledMetricKeys}
                    overviewChartRef={s.overviewChartRef}
                    onExportChart={() => exportChartPng(s.overviewChartRef.current, "overview-chart.png", s.theme, s.showToast)}
                    accelRuns={s.accelRuns}
                    gpsPointCount={s.gpsPointCount}
                    onGoToRoute={() => s.setActiveTab("gps")}
                  />
                )}

                {s.activeTab === "performance" && (
                  <ErrorBoundary>
                    <PerformanceCharts
                      finalChartData={s.finalChartData}
                      gearDistribution={s.gearDistribution}
                      idleZones={s.idleZones}
                      speedUnit={s.speedUnit}
                      chartTheme={s.chartTheme}
                      xAxis={s.chartXAxis}
                      transmissionConfig={s.transmissionConfig}
                    />
                  </ErrorBoundary>
                )}

                {s.activeTab === "engine" && (
                  <ErrorBoundary>
                    <EngineCharts
                      finalChartData={s.finalChartData}
                      idleZones={s.idleZones}
                      tempSensors={s.tempSensors}
                      chartTheme={s.chartTheme}
                      xAxis={s.chartXAxis}
                      selectedTempSensors={s.selectedTempSensors}
                      setSelectedTempSensors={s.setSelectedTempSensors}
                    />
                  </ErrorBoundary>
                )}

                {s.activeTab === "analysis" && (
                  <ErrorBoundary fallback={<ChartEmptyState message="Couldn't render the channel explorer." />}>
                    <ChannelsExplorer
                      data={s.data}
                      finalChartData={s.finalChartData}
                      metrics={s.metrics}
                      selectedPIDs={s.selectedPIDs}
                      addPID={s.addPID}
                      removePID={s.removePID}
                      setSelectedPIDs={s.setSelectedPIDs}
                      idleZones={s.idleZones}
                      chartTheme={s.chartTheme}
                      xAxis={s.chartXAxis}
                      currentTime={s.currentTime}
                      hoveredTimeKey={s.pidAnalysisHoveredTimeKey}
                      setHoveredTimeKey={s.setPidAnalysisHoveredTimeKey}
                    />
                  </ErrorBoundary>
                )}

                {s.activeTab === "gps" && (
                  <ErrorBoundary>
                    <GpsWorkspace
                      data={s.data}
                      currentTime={s.currentTime}
                      gpsPointCount={s.gpsPointCount}
                      elevationData={s.elevationData}
                      chartTheme={s.chartTheme}
                      theme={s.theme}
                      speedUnit={s.speedUnit}
                      onNotify={s.showToast}
                    />
                  </ErrorBoundary>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {hasData && <BottomNav activeTab={s.activeTab} onSelect={s.setActiveTab} />}

      <TransmissionDialog
        open={transmissionOpen}
        onClose={() => setTransmissionOpen(false)}
        config={s.transmissionConfig}
        data={s.data}
        speedUnit={s.speedUnit}
        onApply={s.applyTransmission}
        showToast={s.showToast}
        defaultConfig={s.DEFAULT_TRANSMISSION}
      />
      <MissingPidsDialog
        open={s.showMissingPIDsDialog}
        onOpenChange={s.setShowMissingPIDsDialog}
        missing={s.missingPIDs.missing}
        hasCriticalMissing={s.missingPIDs.hasCriticalMissing}
      />
      {SHARING_ENABLED && (
        <ShareLinkDialog
          open={s.shareDialogOpen}
          onOpenChange={s.setShareDialogOpen}
          shareUrl={s.shareUrl}
          shareExpiresAt={s.shareExpiresAt}
          shareCopied={s.shareCopied}
          onCopy={s.copyShareUrl}
        />
      )}
      <SharePromptDialog shareId={s.pendingShareId} onLoad={s.loadSharedLog} onDismiss={s.dismissSharedPrompt} />
      <Toast message={s.toastMessage} />
    </div>
  )
}
