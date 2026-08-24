"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts"
import { Search, Star, Plus, X, BarChart3, MoveHorizontal, ArrowLeft, ArrowRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/telemetry/section-header"
import { Sparkline } from "@/components/telemetry/sparkline"
import { tooltipFormatter, formatValue } from "@/lib/format"
import { computeChannelStat, type ChannelStatus } from "@/lib/channel-stats"
import { categoryOf, labelForCategory, CHANNEL_CATEGORIES } from "@/lib/channel-categories"
import { TELEMETRY, type ChartTheme } from "@/lib/chart-theme"
import { resolveHoverIndex } from "@/lib/hover-map"
import type { ChartXAxis } from "@/lib/chart-x"
import type { DataPoint, MetricConfig } from "@/types/obd"

interface ChannelsExplorerProps {
  data: DataPoint[]
  finalChartData: DataPoint[]
  metrics: MetricConfig[]
  selectedPIDs: string[]
  addPID: (key: string) => void
  removePID: (key: string) => void
  setSelectedPIDs: (keys: string[]) => void
  idleZones: { x1: number; x2: number }[]
  chartTheme: ChartTheme
  xAxis: ChartXAxis
  currentTime: number
  hoveredTimeKey: number | null
  setHoveredTimeKey: (v: number | null) => void
}

const STATUS_STYLE: Record<ChannelStatus, string> = {
  healthy: "bg-success/15 text-success",
  empty: "bg-muted text-muted-foreground",
  constant: "bg-warning/15 text-warning",
}

export const ChannelsExplorer = React.memo(function ChannelsExplorer(props: ChannelsExplorerProps) {
  const {
    data, finalChartData, metrics, selectedPIDs, addPID, removePID, setSelectedPIDs,
    idleZones, chartTheme, xAxis, currentTime, hoveredTimeKey, setHoveredTimeKey,
  } = props

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | ChannelStatus>("all")
  const [pinned, setPinned] = useState<Set<string>>(new Set())

  const stats = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeChannelStat>>()
    for (const m of metrics) map.set(m.key as string, computeChannelStat(data, m.key as string))
    return map
  }, [data, metrics])

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    let result = metrics.filter((m) => {
      const st = stats.get(m.key as string)
      if (category !== "all" && categoryOf(m) !== category) return false
      if (statusFilter !== "all" && st?.status !== statusFilter) return false
      if (q && !m.label.toLowerCase().includes(q) && !(m.originalName ?? "").toLowerCase().includes(q)) return false
      return true
    })
    // Pinned first, then original order.
    result = [...result].sort((a, b) => {
      const ap = pinned.has(a.key as string) ? 0 : 1
      const bp = pinned.has(b.key as string) ? 0 : 1
      return ap - bp
    })
    return result
  }, [metrics, stats, query, category, statusFilter, pinned])

  const pidDisplayTimeKey = hoveredTimeKey !== null ? hoveredTimeKey : currentTime

  const togglePin = (key: string) =>
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const { grid, axis, tooltipContentStyle } = chartTheme
  const availableCategories = useMemo(
    () => CHANNEL_CATEGORIES.filter((c) => metrics.some((m) => categoryOf(m) === c.id)),
    [metrics],
  )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
      {/* Explorer table */}
      <Card className="flex flex-col p-4 shadow-sm xl:col-span-5">
        <SectionHeader title="Data Channels" hint="Every detected PID with its range, live value and health status." />
        <div className="mb-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels…" aria-label="Search channels" className="h-9 pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>All</FilterChip>
            {availableCategories.map((c) => (
              <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "healthy", "constant", "empty"] as const).map((s) => (
              <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s === "all" ? "Any status" : s[0].toUpperCase() + s.slice(1)}
              </FilterChip>
            ))}
          </div>
        </div>

        <HScroll className="-mx-1 max-h-[560px] px-1">
          {/* A comfortable minimum width keeps values from being crushed on narrow screens; when the
              viewport is narrower than this the HScroll wrapper reveals its scroll affordance rather
              than clipping silently. */}
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-left text-[11px] font-medium text-muted-foreground">
                <th className="py-2.5 pr-2 font-medium">Channel</th>
                <th className="px-2 py-2.5 text-right font-medium">Current</th>
                <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Min</th>
                <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Max</th>
                <th className="hidden px-2 py-2.5 font-medium md:table-cell">Trend</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="py-2.5 pl-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No channels match the filters.</td></tr>
              )}
              {rows.map((m) => {
                const key = m.key as string
                const st = stats.get(key)
                const selected = selectedPIDs.includes(key)
                const cur = data[pidDisplayTimeKey]?.[key]
                // The full original PID name (before shortening). Exposed via title + aria-label so a
                // long name that truncates visually — or a shortened label that collides with a
                // near-duplicate (e.g. two fuel-trim banks) — stays discoverable and distinguishable.
                const fullName = m.originalName ?? m.label
                return (
                  <tr key={key} className="border-b border-border/40 hover:bg-accent/40">
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        onClick={() => (selected ? removePID(key) : addPID(key))}
                        className="flex items-center gap-2 text-left"
                        aria-label={selected ? `Remove ${fullName} from charts` : `Inspect ${fullName}`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                        <span className="min-w-0 max-w-[16rem]">
                          <span className="block truncate font-medium" title={fullName}>{m.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground" title={fullName}>{labelForCategory(categoryOf(m))}{m.unit ? ` · ${m.unit}` : ""}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{typeof cur === "number" ? formatValue(cur, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">{st?.min != null ? formatValue(st.min, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">{st?.max != null ? formatValue(st.max, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 md:table-cell"><Sparkline values={st?.spark ?? []} color={m.color} /></td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[st?.status ?? "empty"]}`}>{st?.status ?? "empty"}</span>
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" onClick={() => togglePin(key)} aria-label={pinned.has(key) ? `Unpin ${fullName}` : `Pin ${fullName}`} title="Pin" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Star className={`h-3.5 w-3.5 ${pinned.has(key) ? "fill-warning text-warning" : ""}`} />
                        </button>
                        <button type="button" onClick={() => (selected ? removePID(key) : addPID(key))} aria-label={selected ? `Remove ${fullName}` : `Add ${fullName} to charts`} title={selected ? "Remove" : "Add to charts"} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          {selected ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </HScroll>
      </Card>

      {/* Detail charts */}
      <Card className="flex flex-col p-4 shadow-sm xl:col-span-7">
        <SectionHeader
          title={`Inspector${selectedPIDs.length ? ` · ${selectedPIDs.length}` : ""}`}
          hint="Selected channels plotted with synchronised hover. Add channels from the table."
          actions={selectedPIDs.length > 0 ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedPIDs([])}>Clear</Button> : undefined}
        />
        {selectedPIDs.length === 0 ? (
          <div className="mt-2 flex items-start gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 text-left text-muted-foreground">
            <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 opacity-50" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground/80">No channels selected</p>
              <p className="mt-0.5 text-xs">Click a row or its <span className="font-medium text-foreground/70">+</span> button to plot a channel here. Add several to compare them with a synced cursor.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {selectedPIDs.map((key) => {
              const m = metrics.find((mm) => mm.key === key)
              if (!m) return null
              const cur = data[pidDisplayTimeKey]?.[key]
              return (
                <div key={key} data-testid={`inspector-chart-${key}`} className="flex flex-col rounded-lg border border-border/70 bg-secondary/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                      <h3 className="text-sm font-medium">{m.label}</h3>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePID(key)} aria-label={`Remove ${m.label} chart`}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="min-h-[220px] flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={finalChartData}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                        syncId="channelsSync"
                        onMouseMove={(state) => {
                          // Map back via the point's explicit original row index (preserved through
                          // slicing + downsampling) — never the x value, which is now elapsed seconds.
                          // The resolver is unit-tested in lib/hover-map.test.ts.
                          const s = state as {
                            activePayload?: Array<{ payload?: DataPoint }>
                            activeTooltipIndex?: number
                          }
                          const idx = resolveHoverIndex(s?.activePayload, s?.activeTooltipIndex, finalChartData)
                          if (idx !== null) setHoveredTimeKey(idx)
                        }}
                        onMouseLeave={() => setHoveredTimeKey(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                        <XAxis dataKey={xAxis.key} type="number" domain={["dataMin", "dataMax"]} stroke={axis} fontSize={10} tickFormatter={(v) => xAxis.format(Number(v))} />
                        <YAxis stroke={axis} fontSize={10} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} labelFormatter={(v: unknown) => `${xAxis.label}: ${xAxis.format(Number(v))}`} />
                        <Line dataKey={key} stroke={m.color} strokeWidth={2} dot={false} name={`${m.label} (${m.unit})`} />
                        {idleZones.map((zone, i) => (
                          <ReferenceArea key={`idle-${i}`} x1={zone.x1} x2={zone.x2} fill={TELEMETRY.idle} fillOpacity={0.08} stroke={TELEMETRY.idle} strokeOpacity={0.2} strokeDasharray="4 4" />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-lg font-bold" data-testid={`inspector-value-${key}`} style={{ color: m.color }}>
                      {typeof cur === "number" ? formatValue(cur, m.unit) : "N/A"}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
})

/**
 * A horizontally + vertically scrollable viewport that reveals subtle, theme-aware edge fades ONLY
 * while there is more content to scroll toward, plus a STATE-AWARE hint whose wording matches the
 * scroll position: at the start it points right ("more columns"), in the middle it points both
 * ways, and at the end it points back left ("previous columns") — so it never implies there are
 * more columns to the right when there aren't. Each fade disappears at its own edge, and both cues
 * vanish entirely when the content fits, so nothing ever misleads.
 */
function HScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 1px tolerance absorbs sub-pixel rounding so the cue doesn't flicker at the extremes.
    setEdges({ start: el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    // Observe both the viewport and its content so the cue re-evaluates when the width available
    // to the table changes (responsive breakpoints) or the row set changes.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [update])

  // Wording follows the measured edges. `data-cue-state` gives the browser test a stable hook for
  // each state without asserting on copy alone.
  const cue = edges.end
    ? edges.start
      ? { state: "both", Icon: MoveHorizontal, text: "Scroll horizontally to view more columns" }
      : { state: "right", Icon: ArrowRight, text: "Scroll right for more columns" }
    : edges.start
      ? { state: "left", Icon: ArrowLeft, text: "Scroll left to view previous columns" }
      : null

  return (
    <div className="relative">
      <div ref={ref} data-testid="channels-scroll" className={`custom-scrollbar overflow-auto ${className ?? ""}`}>
        {children}
      </div>
      {/* Left / right edge fades — pointer-events-none so they never block the scrollbar or clicks. */}
      <div aria-hidden data-testid="channels-scroll-fade-start" className={`pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent transition-opacity duration-150 ${edges.start ? "opacity-100" : "opacity-0"}`} />
      <div aria-hidden data-testid="channels-scroll-fade-end" className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-150 ${edges.end ? "opacity-100" : "opacity-0"}`} />
      {cue && (
        <p data-testid="channels-scroll-hint" data-cue-state={cue.state} className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <cue.Icon className="h-3 w-3" aria-hidden="true" />
          {cue.text}
        </p>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
        active ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}
