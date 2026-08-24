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
    <div className="mx-auto mt-8 w-full max-w-3xl md:mt-16">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/45 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Private, client-side analysis
        </span>
        <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Decode your drive
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          Drop an OBD-II CSV log to explore RPM, speed, boost, gearbox usage and the GPS track — charted instantly on your machine.
        </p>
      </div>

      <Card
        className={`border-dashed p-7 text-center transition-colors duration-200 sm:p-10 ${
          isDragOver ? "border-primary/65 bg-primary/[0.045]" : "hover:border-primary/35"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border transition-colors ${
          isDragOver ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-secondary/45 text-muted-foreground"
        }`}>
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{isDragOver ? "Drop CSV file(s) here" : "Drag and drop CSV file(s)"}</h3>
        <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          Select one or multiple CSV files. Session parts with matching PIDs are merged automatically into one timeline.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={onChooseFiles}><Upload className="mr-2 h-4 w-4" />Choose CSV file(s)</Button>
          <Button onClick={onLoadSample} variant="outline"><FileText className="mr-2 h-4 w-4" />Load sample data</Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Works with exports from{" "}
          {SOURCES.map((s, i) => (
            <span key={s}>
              <span className="font-medium text-foreground/75">{s}</span>
              {i < SOURCES.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          and most OBD-II loggers.
        </p>
      </Card>

      <div className="mt-5 divide-y divide-border/70 rounded-lg border border-border/70 bg-card/45 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <InfoItem icon={<ShieldCheck className="h-4 w-4" />} title="Private by default">
          Files stay in your browser unless you create a share link.
        </InfoItem>
        <InfoItem icon={<Layers className="h-4 w-4" />} title="Merge session parts">
          Matching session files become one continuous timeline.
        </InfoItem>
        <InfoItem icon={<GitCompare className="h-4 w-4" />} title="Separate drives">
          Load unrelated drives or devices one at a time.
        </InfoItem>
      </div>
    </div>
  )
}

function InfoItem({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 text-left">
      <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
