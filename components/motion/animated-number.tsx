"use client"

import { type ReactNode, useEffect, useRef } from "react"
import { animate, useMotionValue, useReducedMotion } from "motion/react"
import { DURATION } from "@/lib/motion"

interface AnimatedNumberProps {
  /** The numeric value to display. Non-finite values (null/undefined/NaN) render `fallback` verbatim. */
  value: number | null | undefined
  /** Formats the (interpolating) number to its final display string, e.g. `(n) => n.toFixed(1)`. */
  format?: (n: number) => string
  /**
   * Live playback readouts change many times per second; interpolating between them would visibly
   * lag the cursor. Pass `live` to snap straight to each value (no tween) while still using the
   * component for consistent formatting + accessible output.
   */
  live?: boolean
  /** Shown when `value` is not a finite number. Never animated into a fake number. Defaults to "N/A". */
  fallback?: ReactNode
  duration?: number
  className?: string
}

/**
 * A count-up numeric readout that animates only the digits, only when there is a real finite value
 * to show, and only when the value actually changes — the tween runs off a Motion value written
 * straight to the DOM node, so unrelated React re-renders never restart it. Reduced-motion and
 * `live` both collapse the tween to an instant set. Screen readers get the final formatted value
 * from an always-current sr-only node (not every intermediate frame).
 */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), live, fallback = "N/A", duration, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const finite = typeof value === "number" && Number.isFinite(value)
  const target = finite ? (value as number) : 0
  const mv = useMotionValue(target)
  const displayRef = useRef<HTMLSpanElement>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const node = displayRef.current
    if (!node) return
    const render = (n: number) => {
      node.textContent = format(n)
    }
    // Keep the visible text in sync with the motion value as it interpolates.
    const unsub = mv.on("change", render)
    if (!finite) {
      unsub()
      return
    }
    // First paint, reduced motion, or a live readout: show the value immediately with no tween.
    if (!mountedRef.current || reduce || live) {
      mountedRef.current = true
      mv.set(target)
      render(target)
      return unsub
    }
    const controls = animate(mv, target, { duration: duration ?? DURATION.base, ease: [0.16, 1, 0.3, 1] })
    return () => {
      controls.stop()
      unsub()
    }
    // `format` is intentionally excluded: a new inline formatter each render must not restart the tween.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, finite, reduce, live, duration])

  if (!finite) return <span className={className}>{fallback}</span>

  return (
    <span className={className}>
      {/* Visible interpolating digits; hidden from AT so it isn't announced on every frame. */}
      <span ref={displayRef} aria-hidden="true">
        {format(target)}
      </span>
      {/* Always the final, correctly-formatted value for assistive tech. */}
      <span className="sr-only">{format(target)}</span>
    </span>
  )
}
