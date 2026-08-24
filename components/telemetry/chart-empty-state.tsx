import { LineChart } from "lucide-react"

interface ChartEmptyStateProps {
  message: string
  /** Optional secondary line, e.g. how to enable the missing channel. */
  hint?: string
}

/**
 * Shown in place of a chart when the log doesn't include the channels the chart needs. A quiet,
 * dashed placeholder reads as a deliberate "no data" state rather than a blank/broken plot.
 */
export function ChartEmptyState({ message, hint }: ChartEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center p-4">
      <div className="flex max-w-xs flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
        <LineChart className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground/80">{message}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
