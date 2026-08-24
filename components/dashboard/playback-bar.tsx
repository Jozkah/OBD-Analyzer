"use client"

import { Play, Pause, RotateCcw, SkipBack, SkipForward, Clock, Hash, ArrowUp, ArrowDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDuration, type TimeAxis } from "@/lib/elapsed-time"
import { formatValue } from "@/lib/format"
import { shiftIndicatorView, type ShiftState } from "@/lib/gear"
import type { DataPoint } from "@/types/obd"

const RATES = [0.5, 1, 2, 4]

export interface ShiftRecommendation {
  shouldShift: "up" | "down" | "optimal" | null
  reason: string
}

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
  shift: ShiftRecommendation | null
  speedUnit: string
}

const SHIFT_STYLE: Record<ShiftState, { Icon: typeof ArrowUp; cls: string }> = {
  up: { Icon: ArrowUp, cls: "text-success" },
  down: { Icon: ArrowDown, cls: "text-warning" },
  optimal: { Icon: Minus, cls: "text-muted-foreground" },
}

function label(axis: TimeAxis, index: number): string {
  if (axis.trustworthy) return formatDuration(axis.elapsed[index] ?? 0)
  return `#${index}`
}

/** A single live telemetry readout: quiet sentence-case label, neutral tabular value. */
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </span>
  )
}

export function PlaybackBar({
  currentTime, setCurrentTime, timeRange, setTimeRange, lastIndex, timeAxis,
  isPlaying, setIsPlaying, playbackRate, setPlaybackRate, ignoreIdle, setIgnoreIdle,
  currentDataPoint, gear, shift, speedUnit,
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
        {/* Row 1 — transport, position, speed, live readouts */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Compact transport cluster: play/pause primary, the rest secondary. */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setCurrentTime(lo)} aria-label="Jump to start" title="Jump to start (Home)">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant={isPlaying ? "outline" : "default"}
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? "Pause playback" : "Play playback"}
              aria-pressed={isPlaying}
              title="Play / pause (Space)"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setCurrentTime(hi)} aria-label="Jump to end" title="Jump to end (End)">
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setCurrentTime(lo)} aria-label="Restart" title="Restart">
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
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title="This log has no reliable timestamps, so position is shown as a sample index.">
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

          {/* Live values + shift recommendation. Neutral numbers; only the shift badge carries a
              semantic colour. On narrow layouts this becomes a horizontally scrollable strip. */}
          {currentDataPoint && (
            <div className="custom-scrollbar ml-auto flex max-w-full items-center gap-x-4 overflow-x-auto whitespace-nowrap text-xs">
              <Readout label="Speed" value={`${formatValue(currentDataPoint.speed, speedUnit)} ${speedUnit}`} />
              <Readout label="RPM" value={formatValue(currentDataPoint.rpm, "RPM")} />
              <Readout label="Throttle" value={`${formatValue(currentDataPoint.throttle, "%")}%`} />
              <Readout label="Gear" value={String(gear)} />
              {(() => {
                const view = shiftIndicatorView(shift)
                if (!view) return null
                const { Icon, cls } = SHIFT_STYLE[view.state]
                // role="img" gives the badge a discrete, named node a screen reader can read on
                // demand — not a bare span, and not conveyed by colour/icon/title alone. It is
                // deliberately NOT a live region: the recommendation changes on every cursor sample
                // during playback, and aria-live would announce a stream of interruptions.
                return (
                  <span
                    role="img"
                    className={`inline-flex shrink-0 items-center gap-1 rounded border border-current px-1.5 py-0.5 text-[11px] font-medium ${cls}`}
                    aria-label={view.accessibleName}
                    title={view.accessibleName}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {view.label}
                  </span>
                )
              })()}
            </div>
          )}
        </div>

        {/* Row 2 — timeline. The accent-filled playhead and the quieter neutral analysis window
            read as two distinct controls. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">Playhead</span>
            <Slider
              value={[currentTime]}
              onValueChange={([v]: number[]) => setCurrentTime(v)}
              max={lastIndex}
              step={1}
              aria-label="Playback position"
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">Analysis window</span>
            <Slider
              value={timeRange}
              onValueChange={setTimeRange}
              max={lastIndex}
              step={1}
              tone="range"
              aria-label="Analysis window start and end"
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-0 sm:pl-[108px]">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={ignoreIdle}
                onCheckedChange={(c: boolean) => setIgnoreIdle(c === true)}
                aria-label="Ignore idle — exclude stationary (speed = 0) samples from statistics"
              />
              Ignore idle in statistics (excludes speed = 0)
            </label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {label(timeAxis, lo)} – {label(timeAxis, hi)} · {rangeLen} samples ({rangePct}%)
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
