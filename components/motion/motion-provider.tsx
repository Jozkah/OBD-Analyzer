"use client"

import type { ReactNode } from "react"
import { MotionConfig } from "motion/react"
import { DURATION, EASE } from "@/lib/motion"

/**
 * App-wide motion configuration.
 *
 * `reducedMotion="user"` makes Motion honour the OS "reduce motion" setting automatically: for
 * those users it disables transform and layout animations (the large movement / scale / parallax
 * the brief calls out) while still allowing opacity transitions, so state changes stay immediate
 * and content is never gated behind an animation that won't run. The CSS media query in globals.css
 * covers the same ground for any non-Motion (CSS/tailwindcss-animate) transitions.
 *
 * A default transition is provided so bare `animate` props without their own timing still feel
 * consistent with the token system.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE.standard }}>
      {children}
    </MotionConfig>
  )
}
