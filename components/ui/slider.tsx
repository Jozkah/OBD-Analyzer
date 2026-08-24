"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * Visual role. `primary` (default) is the accent-filled playhead. `range` is a quieter neutral
   * selection used for the analysis window, so the two controls stay visually distinct when stacked.
   */
  tone?: "primary" | "range"
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, tone = "primary", ...props }, ref) => {
    const isRange = tone === "range"
    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative w-full grow overflow-hidden rounded-full bg-secondary",
            isRange ? "h-1" : "h-1.5",
          )}
        >
          <SliderPrimitive.Range className={cn("absolute h-full", isRange ? "bg-muted-foreground/50" : "bg-primary")} />
        </SliderPrimitive.Track>
        {props.value?.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className={cn(
              "block rounded-full bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              isRange ? "h-3.5 w-3.5 border-2 border-muted-foreground/70" : "h-4 w-4 border-2 border-primary",
            )}
          />
        ))}
      </SliderPrimitive.Root>
    )
  },
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
