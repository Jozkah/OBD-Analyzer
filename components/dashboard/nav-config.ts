import { LayoutDashboard, Zap, Gauge, ListFilter, MapPin, type LucideIcon } from "lucide-react"

export interface NavSection {
  id: string
  /** Short label used in the sidebar/bottom nav. */
  label: string
  /** Longer name for tooltips / accessible names. */
  fullLabel: string
  icon: LucideIcon
}

// The five primary analysis surfaces. `id` matches the active-tab key used across the app.
export const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Summary", fullLabel: "Session Summary", icon: LayoutDashboard },
  { id: "performance", label: "Perf", fullLabel: "Performance", icon: Zap },
  { id: "engine", label: "Engine", fullLabel: "Engine", icon: Gauge },
  { id: "analysis", label: "Channels", fullLabel: "Data Channels", icon: ListFilter },
  { id: "gps", label: "Route", fullLabel: "Route", icon: MapPin },
]
