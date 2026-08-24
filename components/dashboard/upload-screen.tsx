"use client"

import type React from "react"
import { Upload, FileText, ShieldCheck, Layers, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UploadScreenProps {
  isDragOver: boolean
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
  onChooseFiles: () => void
  onLoadSample: () => void
}

const SOURCES = ["Car Scanner", "Torque", "OBD Fusion", "OBDLink"]

export function UploadScreen({ isDragOver, onDrop, onDragOver, onDragLeave, onChooseFiles, onLoadSample }: UploadScreenProps) {
  return (
    <div className="mx-auto mt-6 w-full max-w-2xl md:mt-12">
      <div className="mb-6 text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
          Decode your <span className="text-primary">drive</span>
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-pretty text-[15px] text-muted-foreground">
          Drop an OBD-II CSV log to explore RPM, speed, boost, gearbox usage and the GPS track — charted instantly, right here on your machine.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          100% client-side · nothing leaves your browser
        </p>
      </div>

      {/* Primary action: a clear drop target, not an oversized floating card. */}
      <div
        className={`rounded-lg border border-dashed p-6 text-center transition-colors sm:p-8 ${
          isDragOver ? "border-primary/70 bg-primary/[0.05]" : "border-border bg-card hover:border-primary/40"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${isDragOver ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary/60 text-muted-foreground"}`}>
          <Upload className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="mb-1.5 text-base font-semibold">{isDragOver ? "Drop CSV file(s) here" : "Drag and drop CSV file(s) here"}</h3>
        <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
          Select one or multiple CSV files. Multiple files are merged automatically, in order, into one continuous session.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={onChooseFiles}><Upload className="mr-2 h-4 w-4" />Choose CSV file(s)</Button>
          <Button onClick={onLoadSample} variant="outline"><FileText className="mr-2 h-4 w-4" />Load sample data</Button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Works with exports from{" "}
          {SOURCES.map((s, i) => (
            <span key={s}>
              <span className="font-medium text-foreground/70">{s}</span>
              {i < SOURCES.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          and most OBD-II loggers.
        </p>
      </div>

      {/* Supporting explanation — a quiet, lightly separated row rather than three shadowed cards. */}
      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-6 sm:grid-cols-3">
        <Feature icon={<ShieldCheck className="h-4 w-4 text-success" />} title="Private by default">
          Files are parsed in your browser. Nothing is uploaded unless you explicitly create a share link.
        </Feature>
        <Feature icon={<Layers className="h-4 w-4 text-info" />} title="Merge session parts">
          Several CSVs of the <em>same</em> session (same PIDs) merge in order into one timeline.
        </Feature>
        <Feature icon={<GitCompare className="h-4 w-4 text-warning" />} title="Independent sessions">
          Logs from different drives or devices aren&rsquo;t time-synchronised — load them one at a time.
        </Feature>
      </div>
    </div>
  )
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="text-left">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
