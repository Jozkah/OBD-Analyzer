"use client"

import type React from "react"
import { Upload, FileText, ShieldCheck, Layers, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

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
    <div className="relative mx-auto mt-6 w-full max-w-3xl md:mt-14">
      <div aria-hidden className="pointer-events-none absolute -top-28 left-1/2 h-72 w-[34rem] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mb-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          100% client-side · nothing leaves your browser
        </span>
        <h2 className="mt-6 text-balance text-4xl font-bold tracking-tight md:text-5xl">
          Decode your <span className="text-primary">drive</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground">
          Drop an OBD-II CSV log to explore RPM, speed, boost, gearbox usage and the GPS track — charted instantly, right here on your machine.
        </p>
      </div>

      <Card
        className={`relative border-dashed p-8 text-center transition-all duration-200 sm:p-10 ${
          isDragOver ? "border-primary/70 bg-primary/[0.06]" : "hover:border-primary/40"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors ${isDragOver ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary/60 text-muted-foreground"}`}>
          <Upload className="h-7 w-7" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{isDragOver ? "Drop CSV file(s) here" : "Drag and drop CSV file(s) here"}</h3>
        <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
          Select one or multiple CSV files. Multiple files are merged automatically, in order, into one continuous session.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={onChooseFiles}><Upload className="mr-2 h-4 w-4" />Choose CSV file(s)</Button>
          <Button onClick={onLoadSample} variant="outline"><FileText className="mr-2 h-4 w-4" />Load sample data</Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Works with exports from{" "}
          {SOURCES.map((s, i) => (
            <span key={s}>
              <span className="font-medium text-foreground/70">{s}</span>
              {i < SOURCES.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          and most OBD-II loggers.
        </p>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoCard icon={<ShieldCheck className="h-4 w-4 text-success" />} title="Private by default">
          Files are parsed in your browser. Nothing is uploaded unless you explicitly create a share link.
        </InfoCard>
        <InfoCard icon={<Layers className="h-4 w-4 text-info" />} title="Merge session parts">
          Several CSVs of the <em>same</em> session (same PIDs) merge in order into one timeline.
        </InfoCard>
        <InfoCard icon={<GitCompare className="h-4 w-4 text-warning" />} title="Independent sessions">
          Logs from different drives or devices aren't time-synchronised — load them one at a time.
        </InfoCard>
      </div>
    </div>
  )
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 text-left">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{children}</p>
    </Card>
  )
}
