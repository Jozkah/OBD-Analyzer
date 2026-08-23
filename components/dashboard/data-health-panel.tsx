"use client"

import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { SectionHeader } from "@/components/telemetry/section-header"
import { summarizeHealth, type HealthFinding, type HealthSeverity } from "@/lib/data-health"

const SEVERITY_META: Record<HealthSeverity, { icon: typeof Info; wrap: string; iconClass: string; word: string }> = {
  critical: { icon: AlertCircle, wrap: "border-danger/40 bg-danger/10", iconClass: "text-danger", word: "Critical" },
  warning: { icon: AlertTriangle, wrap: "border-warning/40 bg-warning/10", iconClass: "text-warning", word: "Warning" },
  info: { icon: Info, wrap: "border-info/30 bg-info/10", iconClass: "text-info", word: "Info" },
}

interface DataHealthPanelProps {
  findings: HealthFinding[]
}

export function DataHealthPanel({ findings }: DataHealthPanelProps) {
  const counts = summarizeHealth(findings)

  return (
    <Card className="flex h-full flex-col p-5">
      <SectionHeader
        title="Data Health"
        hint="What the imported data can and can't support. Not a diagnosis of the vehicle."
        actions={
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            {counts.critical > 0 && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">{counts.critical} critical</span>}
            {counts.warning > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{counts.warning} warn</span>}
            {counts.info > 0 && <span className="rounded-full bg-info/15 px-2 py-0.5 text-info">{counts.info} info</span>}
          </div>
        }
      />
      {findings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/80">No issues detected</p>
          <p className="max-w-xs text-xs text-muted-foreground">All critical channels are present and timestamps look reliable.</p>
        </div>
      ) : (
        <ul className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
          {findings.map((f) => {
            const meta = SEVERITY_META[f.severity]
            const Icon = meta.icon
            return (
              <li key={f.id} className={`rounded-lg border p-3 ${meta.wrap}`}>
                <div className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      <span className="sr-only">{meta.word}: </span>
                      {f.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                    {f.affects && <p className="mt-1 text-[11px] text-muted-foreground/80">Affects: {f.affects}</p>}
                    {f.action && <p className="mt-0.5 text-[11px] text-primary/90">→ {f.action}</p>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
