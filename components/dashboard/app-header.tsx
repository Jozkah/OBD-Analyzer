"use client"

import Link from "next/link"
import {
  Gauge, Upload, FileText, MoreHorizontal, Sun, Moon, Settings, Download, Share2, History, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AppHeaderProps {
  fileName: string | null
  fileCount: number
  recordCount: number
  speedUnit: string
  hasData: boolean
  theme: "light" | "dark"
  sharingEnabled: boolean
  isSharing: boolean
  onLoadClick: () => void
  onLoadSample: () => void
  onExport: () => void
  onShare: () => void
  onOpenTransmission: () => void
  onToggleTheme: () => void
}

export function AppHeader({
  fileName, fileCount, recordCount, speedUnit, hasData, theme, sharingEnabled, isSharing,
  onLoadClick, onLoadSample, onExport, onShare, onOpenTransmission, onToggleTheme,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="flex w-full items-center gap-3 px-4 py-2.5 lg:px-6">
        {/* Identity + session status */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold tracking-tight">OBD Analyzer</h1>
            {fileName ? (
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span className="truncate font-medium text-foreground/80">
                  {fileCount > 1 ? `${fileCount} files merged` : fileName}
                </span>
                <span className="hidden tabular-nums sm:inline">· {recordCount} records</span>
                <span className="hidden sm:inline">· {speedUnit}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Telemetry console</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <Button onClick={onLoadClick} size="sm">
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Load CSV</span>
          </Button>
          <Button
            onClick={onToggleTheme}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Data</DropdownMenuLabel>
              <DropdownMenuItem onClick={onLoadSample}>
                <FileText className="mr-2 h-4 w-4" /> Load sample data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport} disabled={!hasData}>
                <Download className="mr-2 h-4 w-4" /> Export window as CSV
              </DropdownMenuItem>
              {sharingEnabled && (
                <DropdownMenuItem onClick={onShare} disabled={!hasData || isSharing}>
                  <Share2 className="mr-2 h-4 w-4" /> {isSharing ? "Sharing…" : "Share log"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Configure</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenTransmission} disabled={!hasData}>
                <Settings className="mr-2 h-4 w-4" /> Transmission…
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/changelogs">
                  <History className="mr-2 h-4 w-4" /> Changelog
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
