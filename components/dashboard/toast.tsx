"use client"

interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-20 right-4 z-[100] flex items-center gap-2.5 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-xl shadow-black/40 md:bottom-6 md:right-6 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      {message}
    </div>
  )
}
