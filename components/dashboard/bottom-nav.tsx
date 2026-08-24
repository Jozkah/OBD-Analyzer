"use client"

import { motion } from "motion/react"
import { NAV_SECTIONS } from "./nav-config"
import { SPRING } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface BottomNavProps {
  activeTab: string
  onSelect: (id: string) => void
}

/**
 * Mobile bottom navigation. One tappable destination per primary section (no wrapped multi-row
 * tabs). Fixed to the bottom with a safe-area inset; large hit targets (min-h-14).
 *
 * A shared underline (layoutId) springs between the active destinations. Reduced motion drops the
 * slide and the underline just moves to the active tab.
 */
export function BottomNav({ activeTab, onSelect }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon
          const active = activeTab === section.id
          return (
            <li key={section.id} className="relative">
              {active && (
                <motion.span
                  layoutId="bottomNavActive"
                  transition={SPRING.layout}
                  className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
