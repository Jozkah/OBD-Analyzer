"use client"

import { Settings } from "lucide-react"
import { motion } from "motion/react"
import { NAV_SECTIONS } from "./nav-config"
import { SPRING } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface SideNavProps {
  activeTab: string
  onSelect: (id: string) => void
  onOpenSettings: () => void
  settingsDisabled?: boolean
}

/**
 * Desktop navigation rail. Icon + label buttons; collapses to an icon-only rail below xl.
 * Every control keeps an accessible name (aria-label + title) so the icon-only state stays usable.
 *
 * The active-section highlight is a single shared element (layoutId) that springs between items as
 * the selection changes, rather than a hard background swap. Under reduced motion Motion disables
 * the layout tween, so the highlight simply appears on the active item.
 */
export function SideNav({ activeTab, onSelect, onOpenSettings, settingsDisabled }: SideNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-16 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar/70 px-2 py-4 backdrop-blur-xl md:flex xl:w-52"
    >
      <ul className="flex flex-col gap-1">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon
          const active = activeTab === section.id
          return (
            <li key={section.id} className="relative">
              {active && (
                <motion.span
                  layoutId="sideNavActive"
                  transition={SPRING.layout}
                  className="absolute inset-0 rounded-lg bg-sidebar-accent"
                  aria-hidden="true"
                />
              )}
              {active && (
                <motion.span
                  layoutId="sideNavActiveBar"
                  transition={SPRING.layout}
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={active ? "page" : undefined}
                aria-label={section.fullLabel}
                title={section.fullLabel}
                className={cn(
                  "relative z-10 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="hidden xl:inline">{section.fullLabel}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={onOpenSettings}
        disabled={settingsDisabled}
        aria-label="Settings — transmission configuration"
        title="Transmission configuration"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors",
          "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="hidden xl:inline">Settings</span>
      </button>
    </nav>
  )
}
