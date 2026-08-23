"use client"

import { Play, Pause, RotateCcw, SkipBack, SkipForward, Clock, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDuration, type TimeAxis } from "@/lib/elapsed-time"
import { formatValue } from "@/lib/format"
import type { DataPoint } from "@/types/obd"

const RATES = [0.5, 1, 2, 4]

interface PlaybackBarProps {
  currentTime: number
  setCurrentTime: (v: number) => void
  timeRange: number[]
  setTimeRange: (v: number[]) => void
  lastIndex: number
  timeAxis: TimeAxis
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  playbackRate: number
  setPlaybackRate: (v: number) => void
  ignoreIdle: boolean
  setIgnoreIdle: (v: boolean) => void
  currentDataPoint: DataPoint | null
  gear: number | string
  speedUnit: string
}

function label(axis: TimeAxis, index: number): string {
  if (axis.trustworthy) return formatDuration(axis.elapsed[index] ?? 0)
  return `#${index}`
}

export function PlaybackBar({
  currentTime, setCurrentTime, timeRange, setTimeRange, lastIndex, timeAxis,
  isPlaying, setIsPlaying, playbackRate, setPlaybackRate, ignoreIdle, setIgnoreIdle,
  currentDataPoint, gear, speedUnit,
}: PlaybackBarProps) {
  const [lo, hi] = timeRange
  const total = timeAxis.trustworthy && timeAxis.totalSeconds != null ? formatDuration(timeAxis.totalSeconds) : `${lastIndex}`
  const rangeLen = hi - lo + 1
  const rangePct = lastIndex > 0 ? ((rangeLen / (lastIndex + 1)) * 100).toFixed(0) : "100"

  return (
    <section
      aria-label="Playback and time range"
      className="sticky top-[57px] z-30 border-b border-border/70 bg-background/85 px-4 py-2.5 backdrop-blur-xl lg:px-6"
    >
      <div className="flex flex-col gap-2.5">
        {/* Transport + live readouts */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentTime(lo)} aria-label="Jump to start" title="Jump to start (Home)">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon"
              className="h-8 w-8 data-[playing=true]:border-primary/60 data-[playing=true]:text-primary"
              data-playing={isPlaying}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? "Pause playback" : "Play playback"}
              aria-pressed={isPlaying}
              title="Play / pause (Space)"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentTime(hi)} aria-label="Jump to end" title="Jump to end (End)">
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentTime(lo)} aria-label="Restart" title="Restart">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Position readout — real elapsed time, or an explicit sample label when untrustworthy */}
          <div className="flex items-center gap-1.5 text-sm">
            {timeAxis.trustworthy ? (
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Hash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="font-mono tabular-nums text-foreground">
              {label(timeAxis, currentTime)} <span className="text-muted-foreground">/ {total}</span>
            </span>
            {!timeAxis.trustworthy && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title="This log has no reliable timestamps, so position is shown as a sample index.">
                sample
              </span>
            )}
          </div>

          {/* Speed control */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8" title="Playback speed">
                {playbackRate}× speed
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {RATES.map((r) => (
                <DropdownMenuCheckboxItem key={r} checked={playbackRate === r} onCheckedChange={() => setPlaybackRate(r)}>
                  {r}×
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Live values */}
          {currentDataPoint && (
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
              <span><span className="text-muted-foreground">SPD </span><span style={{ color: "#22c55e" }}>{formatValue(currentDataPoint.speed, speedUnit)} {speedUnit}</span></span>
              <span><span className="text-muted-foreground">RPM </span><span style={{ color: "#ef4444" }}>{formatValue(currentDataPoint.rpm, "RPM")}</span></span>
              <span><span className="text-muted-foreground">THR </span><span style={{ color: "#eab308" }}>{formatValue(currentDataPoint.throttle, "%")}%</span></span>
              <span><span className="text-muted-foreground">GEAR </span><span style={{ color: "#60a5fa" }}>{gear}</span></span>
            </div>
          )}
        </div>

        {/* Playhead */}
        <Slider
          value={[currentTime]}
          onValueChange={([v]: number[]) => setCurrentTime(v)}
          max={lastIndex}
          step={1}
          aria-label="Playback position"
          className="w-full"
        />

        {/* Time range selection */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-medium uppercase tracking-[0.14em]">Analysis window</span>
            <span className="font-mono tabular-nums">
              {label(timeAxis, lo)} – {label(timeAxis, hi)} · {rangeLen} samples ({rangePct}%)
            </span>
          </div>
          <Slider
            value={timeRange}
            onValueChange={setTimeRange}
            max={lastIndex}
            step={1}
            aria-label="Analysis window start and end"
            className="w-full"
          />
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={ignoreIdle}
              onCheckedChange={(c: boolean) => setIgnoreIdle(c === true)}
              aria-label="Ignore idle — exclude stationary (speed = 0) samples from statistics"
            />
            Ignore idle in statistics (excludes speed = 0)
          </label>
        </div>
      </div>
    </section>
  )
}
