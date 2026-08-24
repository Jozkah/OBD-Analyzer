"use client"

import { AlertTriangle } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { CRUCIAL_PIDS } from "@/lib/constants"

interface MissingPidsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  missing: typeof CRUCIAL_PIDS
  hasCriticalMissing: boolean
}

export function MissingPidsDialog({ open, onOpenChange, missing, hasCriticalMissing }: MissingPidsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            Some channels are missing
          </AlertDialogTitle>
          <AlertDialogDescription>
            This log is missing PIDs that unlock the full analysis. You can still explore what&rsquo;s present.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {hasCriticalMissing && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-4">
              <div className="mb-1 flex items-center gap-2 font-semibold text-danger">
                <AlertTriangle className="h-4 w-4" /> Critical data missing
              </div>
              <p className="text-sm text-foreground/80">
                Engine RPM or Vehicle Speed is absent — performance, gear estimation and acceleration timing will be limited.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
            <h3 className="mb-3 font-semibold text-foreground">Missing PIDs</h3>
            <ul className="space-y-3">
              {missing.map((pid, index) => (
                <li key={index} className="border-l-2 border-warning/70 pl-3">
                  <div className="font-medium text-foreground">{pid.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{pid.description}</div>
                  <div className="mt-1 text-xs text-muted-foreground/80">Affects: {pid.tabs.join(", ")}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm text-foreground/80">
            <p className="mb-1 font-semibold text-info">What you can do</p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>• Enable these PIDs in your OBD logging app.</li>
              <li>• Confirm your vehicle supports them.</li>
              <li>• Re-record and re-import for full analysis.</li>
            </ul>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Continue anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
