import type React from "react"

interface StatCardProps {
  label: string
  value: React.ReactNode
  unit?: string
  /** Optional emphasis colour for the value (semantic token class, e.g. "text-primary"). */
  accentClassName?: string
  hint?: string
  /** Primary metrics read larger; secondary ones stay compact. */
  emphasis?: "primary" | "secondary"
}

/**
 * A single headline metric (label above, tabular value below). Flat by design — the surrounding
 * summary band supplies grouping via spacing and thin dividers rather than a raised tile per metric.
 * Values use the sans face with tabular numerals so columns stay aligned without a terminal look.
 */
export function StatCard({ label, value, unit, accentClassName, hint, emphasis = "secondary" }: StatCardProps) {
  const primary = emphasis === "primary"
  return (
    <div className="min-w-0" title={hint}>
      <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 tabular-nums ${primary ? "text-2xl font-semibold" : "text-lg font-medium"} ${accentClassName ?? "text-foreground"}`}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

interface StatRowProps {
  label: string
  value: React.ReactNode
  valueClassName?: string
}

/** A label/value line for dense readout lists (Session Statistics, Current Values). */
export function StatRow({ label, value, valueClassName }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${valueClassName ?? "text-foreground"}`}>{value}</span>
    </div>
  )
}
