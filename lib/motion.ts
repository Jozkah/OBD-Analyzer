// Centralized motion system for the app.
//
// One source of truth for durations, easings and reusable variants so every animated surface
// (nav, panels, dialogs, cards, telemetry values) shares a consistent feel. Motion is treated as
// polish only: nothing here is required for the UI to function, and Motion's `reducedMotion="user"`
// (set on the app-wide <MotionConfig>, see components/motion/motion-provider.tsx) automatically
// strips transform/layout movement for users who ask for reduced motion while keeping the short
// opacity fades — so content is never hidden behind an animation that won't play.
//
// Guidance encoded here:
//   • transform/opacity only — never animate width/height/box-shadow or large SVG paths per frame
//   • short, restrained timings (feedback ~120ms, entrances ~200–260ms, section swaps ~180ms)
//   • entrances use a few px of travel, not full off-screen slides
import type { Transition, Variants } from "motion/react"

// --- Timing tokens (seconds) ---
export const DURATION = {
  /** Instant tactile feedback (button/press/toggle). */
  fast: 0.12,
  /** Standard element entrance/exit. */
  base: 0.22,
  /** Section / tab content swap — deliberately quick so switching never feels heavy. */
  section: 0.18,
  /** Larger overlays (modal/drawer). */
  overlay: 0.26,
} as const

// Easings. `standard` for most enter/exit; `out` for elements settling into place.
export const EASE = {
  standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

// Springs. `layout` drives shared active-indicators (layoutId) and layout reflow; `press` gives
// controls a subtle, non-bouncy squish.
export const SPRING = {
  layout: { type: "spring", stiffness: 520, damping: 40, mass: 0.9 } as Transition,
  press: { type: "spring", stiffness: 600, damping: 30 } as Transition,
}

// --- Reusable variants ---

/** Plain opacity fade (safe for reduced motion — no transform). */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Entrance that rises a few px into place. Movement is stripped under reduced motion. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, y: 4, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Section / tab content swap: short opacity + a couple px, never a full-width page slide. */
export const section: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.section, ease: EASE.out } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Panel / popover / dropdown entrance (slight scale + rise from the trigger). */
export const panel: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE.out } },
  exit: { opacity: 0, y: 2, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Modal dialog card. */
export const modal: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.overlay, ease: EASE.out } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Bottom sheet / mobile drawer (slides up from the edge). */
export const sheet: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.overlay, ease: EASE.out } },
  exit: { opacity: 0, y: 24, transition: { duration: DURATION.base, ease: EASE.standard } },
}

/** Backdrop / scrim fade. */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}

/**
 * Staggered container: children with `staggerItem` animate in sequence. Stagger timing is a
 * transition-level concern, so reduced motion (which zeroes durations/delays via MotionConfig)
 * naturally collapses it to a simultaneous fade rather than a cascade.
 */
export const staggerContainer = (stagger = 0.05, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
})

export const staggerItem: Variants = fadeUp
