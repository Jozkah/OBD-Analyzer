"use client"

import { useMemo, useState } from "react"
import { Plus, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CHANNEL_CATEGORIES, categoryOf } from "@/lib/channel-categories"
import type { MetricConfig } from "@/types/obd"

interface ChannelPickerProps {
  metrics: MetricConfig[]
  enabledMetrics: MetricConfig[]
  isEmptyPID: (m: MetricConfig) => boolean
  setMetricEnabled: (key: string, enabled: boolean) => void
  setEnabledMetricKeys: (keys: string[]) => void
}

/**
 * Focused channel selection for the Overview chart. Replaces the permanently-tall PID checkbox
 * panel with: preset groups, a searchable "add channel" control, and removable colour chips for
 * the current selection.
 */
export function ChannelPicker({ metrics, enabledMetrics, isEmptyPID, setMetricEnabled, setEnabledMetricKeys }: ChannelPickerProps) {
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)

  const enabledKeys = useMemo(() => new Set(enabledMetrics.map((m) => m.key as string)), [enabledMetrics])

  // Non-empty channels are what presets/search operate on by default.
  const usableMetrics = useMemo(() => metrics.filter((m) => !isEmptyPID(m)), [metrics, isEmptyPID])

  const applyPreset = (categoryId: string) => {
    const keys = usableMetrics.filter((m) => categoryOf(m) === categoryId).map((m) => m.key as string)
    setEnabledMetricKeys(keys)
  }

  const searchResults = useMemo(() => {
    if (!query) return usableMetrics.filter((m) => !enabledKeys.has(m.key as string)).slice(0, 8)
    const q = query.toLowerCase()
    return usableMetrics
      .filter((m) => !enabledKeys.has(m.key as string))
      .filter((m) => m.label.toLowerCase().includes(q) || (m.originalName ?? "").toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, usableMetrics, enabledKeys])

  // Which presets actually have matching channels in this log.
  const availablePresets = useMemo(
    () => CHANNEL_CATEGORIES.filter((c) => usableMetrics.some((m) => categoryOf(m) === c.id)),
    [usableMetrics],
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Presets</span>
        {availablePresets.map((c) => (
          <Button key={c.id} variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => applyPreset(c.id)}>
            {c.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground" onClick={() => setEnabledMetricKeys([])}>
          Clear
        </Button>
      </div>

      {/* Selected channel chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {enabledMetrics.length === 0 ? (
          <span className="text-xs text-muted-foreground">No channels plotted — pick a preset or add channels.</span>
        ) : (
          enabledMetrics.map((m) => (
            <span
              key={m.key as string}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/60 py-0.5 pl-2 pr-1 text-xs"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
              <span className="max-w-[130px] truncate font-medium">{m.label}</span>
              <button
                type="button"
                onClick={() => setMetricEnabled(m.key as string, false)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${m.label} from chart`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Add channel */}
      <div className="relative">
        {adding ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setAdding(false), 150)}
              placeholder="Search channels to add…"
              aria-label="Search channels to add to the chart"
              className="h-8 pl-8"
            />
            {searchResults.length > 0 && (
              <ul className="custom-scrollbar absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                {searchResults.map((m) => (
                  <li key={m.key as string}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setMetricEnabled(m.key as string, true)
                        setQuery("")
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                      <span className="flex-1 truncate">{m.label}</span>
                      {m.unit && <span className="text-xs text-muted-foreground">{m.unit}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add channel
          </Button>
        )}
      </div>
    </div>
  )
}
