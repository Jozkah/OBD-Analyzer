"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Search, ChevronDown, Wand2, Download, Upload, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { detectGearRatios } from "@/lib/gear"
import { exportTransmissionConfig, importTransmissionConfig } from "@/lib/transmission"
import { calculateTireDiameter, parseTireSize } from "@/lib/tire"
import { TRANSMISSION_PRESETS } from "@/lib/transmission-presets"
import { validateTransmissionConfig, type ValidationError } from "@/lib/transmission-validate"
import type { DataPoint, TransmissionConfig } from "@/types/obd"

interface TransmissionDialogProps {
  open: boolean
  onClose: () => void
  /** The committed configuration. The dialog edits a local DRAFT and only commits it on Apply. */
  config: TransmissionConfig
  data: DataPoint[]
  speedUnit: "km/h" | "mph"
  /** Commit the validated draft (persists + recomputes gears). */
  onApply: (cfg: TransmissionConfig) => void
  showToast: (msg: string) => void
  defaultConfig: TransmissionConfig
}

// Theoretical road speed (km/h) in a gear at a given RPM — inverse of calculateGear's formula.
function predictedSpeed(rpm: number, ratio: number, finalDrive: number, tyreDiameterMm: number): number {
  const circ = (Math.PI * tyreDiameterMm) / 1000
  return ((rpm / (ratio * finalDrive)) * circ * 60) / 1000
}

export function TransmissionDialog(props: TransmissionDialogProps) {
  const { open, onClose, config: committedConfig, data, speedUnit, onApply, showToast, defaultConfig } = props
  // `config` is the LOCAL DRAFT — every edit below mutates it, and nothing reaches the app until
  // Apply. All the reads in the JSX therefore reflect unsaved edits.
  const [config, setDraft] = useState<TransmissionConfig>(committedConfig)
  const dialogRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [presetQuery, setPresetQuery] = useState("")
  const [presetSort, setPresetSort] = useState<"default" | "alphabetical">("default")
  const [tireSizeInput, setTireSizeInput] = useState("235/35R19")
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [autoResult, setAutoResult] = useState<ReturnType<typeof detectGearRatios> | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // Discard the draft and close.
  const discardAndClose = () => {
    setConfirmClose(false)
    onClose()
  }
  // Escape / overlay / close-button: confirm before discarding unsaved edits.
  const requestClose = () => {
    if (dirty) setConfirmClose(true)
    else onClose()
  }
  // Ref so the focus-trap effect (which we don't want re-subscribing on every keystroke) always
  // calls the latest requestClose with fresh `dirty`.
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose

  // Seed the draft from the committed config each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setDraft(committedConfig)
    setDirty(false)
    setErrors([])
    setConfirmClose(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus trap + Escape + restore focus.
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const container = dialogRef.current
    const focusable = () =>
      container
        ? Array.from(
            container.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : []
    focusable()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        requestCloseRef.current()
        return
      }
      if (e.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      prevFocusRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const update = (patch: Partial<TransmissionConfig> | ((p: TransmissionConfig) => TransmissionConfig)) => {
    setDirty(true)
    setErrors([])
    if (typeof patch === "function") setDraft(patch)
    else setDraft((prev) => ({ ...prev, ...patch }))
  }

  const filteredPresets = useMemo(() => {
    let result = TRANSMISSION_PRESETS
    if (presetQuery) {
      const q = presetQuery.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.make.toLowerCase().includes(q))
    }
    if (presetSort === "alphabetical") result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [presetQuery, presetSort])

  const gearRows = useMemo(
    () => Array.from({ length: config.numberOfGears }, (_, i) => i + 1),
    [config.numberOfGears],
  )

  if (!open) return null

  const applyAndClose = () => {
    const found = validateTransmissionConfig(config)
    if (found.length > 0) {
      setErrors(found)
      showToast("Fix the highlighted values before applying.")
      return
    }
    onApply(config) // commit the validated draft (persists + recomputes gears)
    setDirty(false)
    showToast("Transmission configuration applied")
    onClose()
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transmission-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <Card className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border/70 p-4 sm:p-5">
          <div>
            <h2 id="transmission-dialog-title" className="text-base font-semibold tracking-tight">Transmission Configuration</h2>
            <p className="text-xs text-muted-foreground">
              {dirty ? <span className="text-warning">Unsaved changes</span> : "Used for gear estimation and shift indicators."}
            </p>
          </div>
          <Button onClick={requestClose} variant="ghost" size="icon" className="h-9 w-9" aria-label="Close transmission configuration">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {errors.length > 0 && (
          <div role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger sm:px-5">
            <p className="font-medium">Please fix:</p>
            <ul className="mt-0.5 list-disc pl-5">
              {errors.map((e) => (
                <li key={e.field}>{e.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
          <Tabs defaultValue="manual" className="space-y-4">
            <TabsList className="flex w-full flex-wrap gap-1 sm:flex-nowrap">
              <TabsTrigger value="manual" className="flex-1 min-w-[80px]">Manual</TabsTrigger>
              <TabsTrigger value="presets" className="flex-1 min-w-[80px]">Presets</TabsTrigger>
              <TabsTrigger value="auto" className="flex-1 min-w-[80px]">Auto-detect</TabsTrigger>
              <TabsTrigger value="io" className="flex-1 min-w-[80px]">Import/Export</TabsTrigger>
            </TabsList>

            {/* Manual */}
            <TabsContent value="manual" className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Final Drive Ratio">
                  <Input type="number" step="0.01" aria-label="Final Drive Ratio" value={config.finalDrive}
                    onChange={(e) => update({ finalDrive: Number.parseFloat(e.target.value) || defaultConfig.finalDrive })} />
                </Field>
                <Field label="Tyre Diameter (mm)">
                  <Input type="number" aria-label="Tyre Diameter in millimetres" value={config.tyreDiameterMm}
                    onChange={(e) => update({ tyreDiameterMm: Number.parseInt(e.target.value) || defaultConfig.tyreDiameterMm })} />
                </Field>
                <Field label="Shift RPM">
                  <Input type="number" aria-label="Shift RPM" value={config.shiftRpm}
                    onChange={(e) => update({ shiftRpm: Number.parseInt(e.target.value) || defaultConfig.shiftRpm })} />
                </Field>
                <Field label="Number of Gears">
                  <Input type="number" min="3" max="10" aria-label="Number of Gears" value={config.numberOfGears}
                    onChange={(e) => {
                      const newGears = Math.min(10, Math.max(3, Number.parseInt(e.target.value) || 6))
                      update((prev) => {
                        const newRatios = { ...prev.gearRatios }
                        for (let i = 1; i <= newGears; i++) if (!newRatios[i]) newRatios[i] = 1.0
                        Object.keys(newRatios).forEach((g) => { if (Number.parseInt(g) > newGears) delete newRatios[Number.parseInt(g)] })
                        return { ...prev, numberOfGears: newGears, gearRatios: newRatios }
                      })
                    }} />
                </Field>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Gear Ratios &amp; predicted speed at {config.shiftRpm} RPM</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {gearRows.map((gear) => {
                    const ratio = config.gearRatios[gear] || 1.0
                    const kmh = predictedSpeed(config.shiftRpm, ratio, config.finalDrive, config.tyreDiameterMm)
                    const shown = speedUnit === "mph" ? kmh / 1.609344 : kmh
                    return (
                      <div key={gear} className="rounded-lg border border-border/60 bg-secondary/30 p-2">
                        <label className="mb-1 block text-xs text-muted-foreground">Gear {gear}</label>
                        <Input type="number" step="0.001" aria-label={`Gear ${gear} ratio`} className="h-8 text-sm" value={ratio}
                          onChange={(e) => update((prev) => ({ ...prev, gearRatios: { ...prev.gearRatios, [gear]: Number.parseFloat(e.target.value) || 1.0 } }))} />
                        <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">≈ {Math.round(shown)} {speedUnit}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Tyre Size Calculator</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Tyre size (e.g. 235/35R19)">
                    <Input type="text" aria-label="Tyre size" value={tireSizeInput} placeholder="235/35R19"
                      onChange={(e) => {
                        setTireSizeInput(e.target.value)
                        const parsed = parseTireSize(e.target.value)
                        if (parsed) update({ tyreDiameterMm: calculateTireDiameter(parsed.width, parsed.aspectRatio, parsed.rimSize) })
                      }} />
                  </Field>
                  <Field label="Calculated diameter">
                    <div className="rounded-md border border-input bg-secondary/50 px-3 py-2 font-mono text-sm tabular-nums">{config.tyreDiameterMm} mm</div>
                  </Field>
                </div>
              </div>
            </TabsContent>

            {/* Presets */}
            <TabsContent value="presets" className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={presetQuery} onChange={(e) => setPresetQuery(e.target.value)} placeholder="Search make or model…" aria-label="Search transmission presets" className="pl-8" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10"><ChevronDown className="mr-1 h-4 w-4" />Sort</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPresetSort("default")} className={presetSort === "default" ? "bg-accent" : ""}>Default</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPresetSort("alphabetical")} className={presetSort === "alphabetical" ? "bg-accent" : ""}>Alphabetical</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid gap-3">
                {filteredPresets.map((preset) => (
                  <Card key={preset.name} className="border-border/70 bg-secondary/30 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground">{preset.name}</h3>
                      <Button size="sm" onClick={() => { update(() => preset.config); showToast(`Applied "${preset.name}"`) }}>Apply</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-4">
                      <div>Gears: <span className="text-foreground">{preset.config.numberOfGears}</span></div>
                      <div>Final: <span className="text-foreground">{preset.config.finalDrive}</span></div>
                      <div>Shift: <span className="text-foreground">{preset.config.shiftRpm}</span></div>
                      <div>Tyre: <span className="text-foreground">{preset.config.tyreDiameterMm}mm</span></div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Auto-detect */}
            <TabsContent value="auto" className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-4 text-center">
                <Button onClick={() => setAutoResult(detectGearRatios(data, speedUnit))} disabled={data.length < 100}>
                  <Wand2 className="mr-2 h-4 w-4" /> Analyse current data
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.length < 100 ? `Need at least 100 samples (currently ${data.length}).` : `Estimate ratios from ${data.length} samples.`}
                </p>
              </div>
              {autoResult && (
                <Card className="border-border/70 bg-secondary/30 p-4">
                  <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div>Detected gears: <span className="font-mono text-foreground">{autoResult.detectedGears}</span></div>
                    <div>Confidence: <span className="font-mono text-foreground">{autoResult.confidence.toFixed(1)}%</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Object.entries(autoResult.gearRatios).map(([gear, ratio]) => (
                      <div key={gear} className="rounded-md bg-secondary/60 p-2 text-xs">
                        <span className="text-muted-foreground">Gear {gear}: </span>
                        <span className="font-mono text-foreground">{(ratio as number).toFixed(3)}</span>
                        <span className="ml-1 rounded bg-info/15 px-1 text-[10px] text-info">est</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="mt-4" onClick={() => {
                    const gearKeys = Object.keys(autoResult.gearRatios).map(Number)
                    const maxGear = gearKeys.length > 0 ? Math.max(...gearKeys) : 6
                    update(() => ({ gearRatios: autoResult.gearRatios, finalDrive: autoResult.estimatedFinalDrive, tyreDiameterMm: autoResult.estimatedTireDiameter, shiftRpm: 7000, numberOfGears: maxGear }))
                    showToast("Applied auto-detected settings")
                  }}>Apply detected settings</Button>
                </Card>
              )}
            </TabsContent>

            {/* Import / Export */}
            <TabsContent value="io" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card className="border-border/70 bg-secondary/30 p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Export</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Save the current configuration to a JSON file.</p>
                  <Button className="w-full" variant="outline" onClick={() => exportTransmissionConfig(config)}><Download className="mr-2 h-4 w-4" />Export settings</Button>
                </Card>
                <Card className="border-border/70 bg-secondary/30 p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Import</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Load a configuration from a JSON file.</p>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) importTransmissionConfig(file, (c) => { update(() => c); showToast("Configuration imported") }, showToast)
                  }} />
                  <Button className="w-full" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import settings</Button>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 p-4 sm:p-5">
          <Button variant="outline" onClick={() => setConfirmReset(true)}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={applyAndClose} disabled={!dirty}>Apply configuration</Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
            <AlertDialogDescription>This replaces your current gear ratios, final drive and tyre size with the built-in defaults.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { update(() => defaultConfig); showToast("Reset to default configuration") }}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unapplied transmission edits. Closing now discards them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndClose}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}
