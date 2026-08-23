import type React from "react"

interface StatCardProps {
  label: string
  value: React.ReactNode
  unit?: string
  /** Optional emphasis colour for the value (semantic token class, e.g. "text-primary"). */
  accentClassName?: string
  hint?: string
}

/** A single headline metric tile (label above, large tabular value below). */
export function StatCard({ label, value, unit, accentClassName, hint }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 p-3" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-xl tabular-nums ${accentClassName ?? "text-foreground"}`}>
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
      <span className={`font-mono tabular-nums ${valueClassName ?? "text-foreground"}`}>{value}</span>
    </div>
  )
}
