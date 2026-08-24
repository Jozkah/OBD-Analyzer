"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react"
import { DURATION, EASE } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type ToastVariant = "success" | "info" | "warning" | "error"

export interface ToastData {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastProps {
  toast: ToastData | null
  onDismiss: () => void
  /** Auto-dismiss delay (ms). Paused while the toast is hovered or focused. */
  duration?: number
}

const VARIANTS: Record<ToastVariant, { icon: typeof Info; accent: string; ring: string }> = {
  success: { icon: CheckCircle2, accent: "text-success", ring: "border-success/30" },
  info: { icon: Info, accent: "text-primary", ring: "border-primary/30" },
  warning: { icon: AlertTriangle, accent: "text-warning", ring: "border-warning/30" },
  error: { icon: XCircle, accent: "text-danger", ring: "border-danger/40" },
}

/**
 * Single-slot toast. Announces via an aria-live region (assertive for errors, polite otherwise),
 * auto-dismisses after `duration`, and pauses that timer whenever the pointer or keyboard focus is
 * on it so a message can't vanish while it's being read or its dismiss button reached. A manual
 * close is always available. Entrance/exit animate through Motion (disabled under reduced motion),
 * but the toast is real DOM the whole time — never gated behind the animation.
 */
export function Toast({ toast, onDismiss, duration = 4000 }: ToastProps) {
  const reduce = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!toast || paused) return
    timerRef.current = setTimeout(onDismiss, duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // Re-arm whenever the message changes or hover/focus is released.
  }, [toast, paused, duration, onDismiss])

  const v = toast ? VARIANTS[toast.variant] : VARIANTS.info
  const Icon = v.icon

  return (
    <div
      className="pointer-events-none fixed bottom-20 right-4 z-[100] md:bottom-6 md:right-6"
      role="status"
      aria-live={toast?.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE.out } }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.standard } }}
            onHoverStart={() => setPaused(true)}
            onHoverEnd={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex max-w-[92vw] items-start gap-2.5 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-xl shadow-black/40 sm:max-w-sm",
              v.ring,
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.accent)} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
