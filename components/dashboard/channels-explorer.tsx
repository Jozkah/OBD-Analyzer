"use client"

import React, { useMemo, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from "recharts"
import { Search, Star, Plus, X, BarChart3 } from "lucide-react"
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* Explorer table */}
      <Card className="flex flex-col p-4 xl:col-span-5">
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

        <div className="custom-scrollbar -mx-1 max-h-[560px] overflow-auto px-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Channel</th>
                <th className="px-2 py-2 text-right font-medium">Current</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Min</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Max</th>
                <th className="hidden px-2 py-2 font-medium md:table-cell">Trend</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="py-2 pl-2 font-medium sr-only">Actions</th>
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
                return (
                  <tr key={key} className="border-b border-border/40 hover:bg-accent/40">
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        onClick={() => (selected ? removePID(key) : addPID(key))}
                        className="flex items-center gap-2 text-left"
                        aria-label={selected ? `Remove ${m.label} from charts` : `Inspect ${m.label}`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{labelForCategory(categoryOf(m))}{m.unit ? ` · ${m.unit}` : ""}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{typeof cur === "number" ? formatValue(cur, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">{st?.min != null ? formatValue(st.min, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">{st?.max != null ? formatValue(st.max, m.unit) : "—"}</td>
                    <td className="hidden px-2 py-1.5 md:table-cell"><Sparkline values={st?.spark ?? []} color={m.color} /></td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[st?.status ?? "empty"]}`}>{st?.status ?? "empty"}</span>
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <button type="button" onClick={() => togglePin(key)} aria-label={pinned.has(key) ? `Unpin ${m.label}` : `Pin ${m.label}`} title="Pin" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Star className={`h-3.5 w-3.5 ${pinned.has(key) ? "fill-warning text-warning" : ""}`} />
                        </button>
                        <button type="button" onClick={() => (selected ? removePID(key) : addPID(key))} aria-label={selected ? `Remove ${m.label}` : `Add ${m.label} to charts`} title={selected ? "Remove" : "Add to charts"} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          {selected ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail charts */}
      <Card className="flex flex-col p-4 xl:col-span-7">
        <SectionHeader
          title={`Inspector${selectedPIDs.length ? ` · ${selectedPIDs.length}` : ""}`}
          hint="Selected channels plotted with synchronised hover. Add channels from the table."
          actions={selectedPIDs.length > 0 ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedPIDs([])}>Clear</Button> : undefined}
        />
        {selectedPIDs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <BarChart3 className="h-10 w-10 opacity-40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground/80">Select channels to inspect</p>
            <p className="max-w-xs text-xs">Click a row or its + button to plot a channel here. Add several to compare with a synced cursor.</p>
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
