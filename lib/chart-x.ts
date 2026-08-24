// Shared configuration for a chart's time/sample x-axis.
//
// When the log has trustworthy timestamps, charts plot against elapsed SECONDS (so irregular
// sampling and gaps are spaced correctly) and label the axis "Time". Otherwise they plot against
// the sample INDEX and label it "Sample" — a row number is never presented as time.
//
// Every chart point still carries its original sample index in `time`, so hover/selection maps
// back to the correct original row regardless of the x domain or downsampling (read
// `payload.time`, not the x value).

import { formatDuration, type TimeAxis } from "@/lib/elapsed-time"

export interface ChartXAxis {
  /** Data key to plot on the x-axis: "elapsed" (seconds) when trusted, else "time" (index). */
  key: "elapsed" | "time"
  /** Axis + tooltip label. */
  label: string
  /** Whether the axis represents real elapsed time. */
  trustworthy: boolean
  /** Formats an x value for ticks and tooltips. */
  format: (v: number) => string
}

export function buildChartXAxis(timeAxis: TimeAxis): ChartXAxis {
  if (timeAxis.trustworthy) {
    return {
      key: "elapsed",
      label: "Time",
      trustworthy: true,
      format: (v: number) => formatDuration(v),
    }
  }
  return {
    key: "time",
    label: "Sample",
    trustworthy: false,
    format: (v: number) => `#${Math.round(v)}`,
  }
}
