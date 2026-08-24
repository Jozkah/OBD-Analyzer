"use client"

import { useEffect } from "react"
import { Share2, Copy, Check } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface ShareLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareUrl: string | null
  shareExpiresAt: string | null
  shareCopied: boolean
  onCopy: () => void
}

export function ShareLinkDialog({ open, onOpenChange, shareUrl, shareExpiresAt, shareCopied, onCopy }: ShareLinkDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" /> Shareable link created
          </AlertDialogTitle>
          <AlertDialogDescription>
            Anyone with this link can view this log
            {shareExpiresAt ? ` until ${new Date(shareExpiresAt).toLocaleString()}` : ""}. The log is stored on this
            instance&rsquo;s backend (not embedded in the link); the link stops working when it expires.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={shareUrl ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onCopy} aria-label="Copy share link">
            {shareCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface SharePromptDialogProps {
  shareId: string | null
  onLoad: (id: string) => void
  onDismiss: () => void
}

export function SharePromptDialog({ shareId, onLoad, onDismiss }: SharePromptDialogProps) {
  useEffect(() => {
    if (!shareId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shareId, onDismiss])

  if (!shareId) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <Card className="w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id="share-confirm-title" className="text-lg font-semibold tracking-tight">Load shared log?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This link is asking to open a shared log. It was created by whoever sent you the link — only load it if
              you trust the source. Loading it replaces anything you currently have open.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDismiss}>Cancel</Button>
          <Button size="sm" onClick={() => onLoad(shareId)} autoFocus>Load shared log</Button>
        </div>
      </Card>
    </div>
  )
}
