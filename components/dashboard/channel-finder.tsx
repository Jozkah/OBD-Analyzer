"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Search, Check, X, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CHANNEL_CATEGORIES, categoryOf, labelForCategory } from "@/lib/channel-categories"
import { computeChannelStat, type ChannelStatus } from "@/lib/channel-stats"
import { backdrop, DURATION } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { DataPoint, MetricConfig } from "@/types/obd"

interface ChannelFinderProps {
  open: boolean
  onClose: () => void
  /** Full metric catalogue — the single source of truth (no second copy of channel state). */
  metrics: MetricConfig[]
  /** Rows the log has data for; used to compute a health badge and hide empty PIDs by default. */
  data: DataPoint[]
  isSelected: (key: string) => boolean
  onToggle: (key: string, next: boolean) => void
  isEmptyPID: (m: MetricConfig) => boolean
  /** Optional preset actions (Overview). Apply replaces the whole selection; clear empties it. */
  onApplyPreset?: (categoryId: string) => void
  onClear?: () => void
  title?: string
}

const STATUS_STYLE: Record<ChannelStatus, string> = {
  healthy: "text-success",
  constant: "text-warning",
  empty: "text-muted-foreground",
}

/**
 * Command-palette style channel finder. Search by label, original CSV header (PID) or category;
 * filter by category and health; toggle channels with pointer or keyboard (↑/↓ to move, Enter to
 * toggle, Escape to close). It reuses the shared metric catalogue and category/health helpers, and
 * writes selection straight back through `onToggle` — there is no second selection store.
 *
 * Presentation adapts by breakpoint: a centred command dialog on desktop, a bottom sheet on mobile
 * (both are the same accessible modal — role="dialog", aria-modal, focus trap, Escape, and focus
 * restored to the opener on close). Movement is stripped under reduced motion; the panel is always
 * real DOM, never gated behind its entrance.
 */
export function ChannelFinder({ open, onClose, metrics, data, isSelected, onToggle, isEmptyPID, onApplyPreset, onClear, title = "Find channels" }: ChannelFinderProps) {
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [health, setHealth] = useState<"all" | ChannelStatus>("all")
  const [showEmpty, setShowEmpty] = useState(false)
  const [active, setActive] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  // Health status per channel (only needed while open).
  const statuses = useMemo(() => {
    if (!open) return new Map<string, ChannelStatus>()
    const m = new Map<string, ChannelStatus>()
    for (const metric of metrics) m.set(metric.key as string, computeChannelStat(data, metric.key as string).status)
    return m
  }, [open, metrics, data])

  const availableCategories = useMemo(
    () => CHANNEL_CATEGORIES.filter((c) => metrics.some((mm) => categoryOf(mm) === c.id)),
    [metrics],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return metrics.filter((m) => {
      if (!showEmpty && isEmptyPID(m)) return false
      if (category !== "all" && categoryOf(m) !== category) return false
      if (health !== "all" && statuses.get(m.key as string) !== health) return false
      if (!q) return true
      const cat = labelForCategory(categoryOf(m)).toLowerCase()
      return (
        m.label.toLowerCase().includes(q) ||
        (m.originalName ?? "").toLowerCase().includes(q) ||
        (m.unit ?? "").toLowerCase().includes(q) ||
        cat.includes(q)
      )
    })
  }, [metrics, query, category, health, showEmpty, statuses, isEmptyPID])

  // Reset transient state each open; capture the opener to restore focus to on close.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setCategory("all")
    setHealth("all")
    setActive(0)
    prevFocusRef.current = document.activeElement as HTMLElement | null
    // Focus the search box after the panel mounts.
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Keep the active row within bounds as the result set shrinks.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)))
  }, [results.length])

  // Focus trap + Escape + restore focus to the opener.
  useEffect(() => {
    if (!open) return
    const container = panelRef.current
    const focusable = () =>
      container
        ? Array.from(
            container.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : []
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      const opener = prevFocusRef.current
      if (opener && opener.isConnected) opener.focus?.()
    }
  }, [open, onClose])

  // Keyboard navigation from the search box: move the highlight and toggle without leaving typing.
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const m = results[active]
      if (m) onToggle(m.key as string, !isSelected(m.key as string))
    }
  }

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const selectedCount = results.filter((m) => isSelected(m.key as string)).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="channel-finder"
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[10vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={reduce ? backdrop : undefined}
            initial={reduce ? undefined : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.overlay, ease: [0.16, 1, 0.3, 1] } }}
            exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98, transition: { duration: DURATION.fast } }}
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-border bg-popover shadow-2xl shadow-black/50 sm:rounded-xl"
          >
            {/* Search header */}
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search by name, PID or category…"
                aria-label="Search channels"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close channel finder">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-3 py-2">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
              {availableCategories.map((c) => (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</Chip>
              ))}
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              {(["all", "healthy", "constant", "empty"] as const).map((s) => (
                <Chip key={s} active={health === s} onClick={() => setHealth(s)}>
                  {s === "all" ? "Any" : s[0].toUpperCase() + s.slice(1)}
                </Chip>
              ))}
            </div>

            {/* Results */}
            <ul ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox" aria-label="Channels">
              {results.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">No channels match — try a different search or filter.</li>
              ) : (
                results.map((m, i) => {
                  const key = m.key as string
                  const selected = isSelected(key)
                  const status = statuses.get(key) ?? "empty"
                  return (
                    <li key={key} data-index={i} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => onToggle(key, !selected)}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          i === active ? "bg-accent" : "hover:bg-accent/60",
                        )}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {labelForCategory(categoryOf(m))}
                            {m.unit ? ` · ${m.unit}` : ""}
                            {m.originalName && m.originalName !== m.label ? ` · ${m.originalName}` : ""}
                          </span>
                        </span>
                        <span className={cn("text-[10px] font-medium uppercase tracking-wide", STATUS_STYLE[status])}>{status}</span>
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
                          )}
                          aria-hidden="true"
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            {/* Footer: presets + selection count */}
            <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-1.5">
                {onApplyPreset &&
                  availableCategories.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onApplyPreset(c.id)}
                      className="rounded-full border border-border/70 px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.label}
                    </button>
                  ))}
                {onClear && (
                  <button
                    type="button"
                    onClick={onClear}
                    className="rounded-full px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <span className="shrink-0 font-mono tabular-nums">{selectedCount} selected · {results.length} shown</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
