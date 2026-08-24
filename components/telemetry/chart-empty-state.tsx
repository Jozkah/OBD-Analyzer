import { BarChart3 } from "lucide-react"

interface ChartEmptyStateProps {
  message: string
  /** Optional secondary line, e.g. how to enable the missing channel. */
  hint?: string
}

/** Shown in place of a chart when the log doesn't include the channels the chart needs. */
export function ChartEmptyState({ message, hint }: ChartEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <BarChart3 className="h-9 w-9 opacity-40" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground/80">{message}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
