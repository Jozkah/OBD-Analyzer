import type { MetricConfig } from "@/types/obd"

export interface ChannelCategory {
  id: string
  label: string
  test: RegExp
}

// Preset channel groups for the Overview picker and the Channels explorer filters. A metric is
// matched against its label + original CSV header, so both standard and dynamically-detected
// columns get categorised.
export const CHANNEL_CATEGORIES: ChannelCategory[] = [
  { id: "driving", label: "Driving", test: /rpm|speed|throttle|brake|gear|accel|pedal|\bload\b|steer/i },
  { id: "boost", label: "Boost", test: /boost|\bmap\b|manifold|turbo|wastegate|charge|intake pressure/i },
  { id: "temps", label: "Temperatures", test: /temp|coolant|intake air|\boil\b|catalyst|exhaust|ambient|thermo/i },
  { id: "fuel", label: "Fuel", test: /fuel|afr|lambda|air.?fuel|injector|rail|trim/i },
  { id: "ignition", label: "Ignition", test: /ignition|timing|advance|spark|knock|dwell/i },
]

export function categoryOf(metric: Pick<MetricConfig, "label" | "originalName">): string {
  const haystack = `${metric.label} ${metric.originalName ?? ""}`
  for (const c of CHANNEL_CATEGORIES) {
    if (c.test.test(haystack)) return c.id
  }
  return "other"
}

export function labelForCategory(id: string): string {
  return CHANNEL_CATEGORIES.find((c) => c.id === id)?.label ?? "Other"
}
