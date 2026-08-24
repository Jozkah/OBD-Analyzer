import type React from "react"
import { Info } from "lucide-react"

interface SectionHeaderProps {
  title: string
  /** Optional short explanation shown as a hover/focus tooltip via the info icon. */
  hint?: string
  /** Optional trailing controls (toggles, export buttons, icons). */
  actions?: React.ReactNode
  /** Optional icon rendered before the title. */
  icon?: React.ReactNode
  className?: string
}

/**
 * Consistent titled header for cards and chart shells. The title is a semantic <h2> so the
 * page keeps a sensible heading outline for screen readers; the optional hint is exposed as an
 * accessible tooltip rather than colour-only affordance.
 */
export function SectionHeader({ title, hint, actions, icon, className }: SectionHeaderProps) {
  return (
    <div className={`mb-4 flex flex-shrink-0 items-center justify-between gap-3 ${className ?? ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h2 className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
        {hint && (
          <span
            className="inline-flex text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground"
            tabIndex={0}
            role="note"
            aria-label={hint}
            title={hint}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
