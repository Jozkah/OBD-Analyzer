"use client"

import type { ReactNode } from "react"

interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
  stroke?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  /** Formats the x-axis heading (elapsed time / distance / sample). */
  labelFormatter?: (label: string | number) => ReactNode
  /** Formats a single series value; receives the raw value and the series name. */
  valueFormatter?: (value: number | string | undefined, name: string | number | undefined) => ReactNode
}

/**
 * Shared, shadcn-style Recharts tooltip. Passed to a chart's `<Tooltip content={...} />`, it renders
 * a consistent card (readable heading, one colour-dotted row per series, right-aligned monospace
 * values) using the semantic chart-tooltip tokens so it tracks the theme. This only changes the
 * hover CARD; the chart's own `onMouseMove`/`syncId` hover resolution and PNG export (SVG-only) are
 * untouched.
 */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="min-w-[8rem] rounded-lg border border-[hsl(var(--chart-tooltip-border))] bg-[hsl(var(--chart-tooltip))]/95 px-3 py-2 text-xs shadow-xl shadow-black/30 backdrop-blur-sm">
      {label != null && (
        <div className="mb-1.5 border-b border-border/40 pb-1 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={entry.dataKey ?? i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color || entry.stroke }} aria-hidden="true" />
            <span className="min-w-0 truncate text-muted-foreground">{entry.name}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums text-foreground">
              {valueFormatter ? valueFormatter(entry.value, entry.name) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
