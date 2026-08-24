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

// The draft is held as RAW STRINGS so a temporarily blank/invalid field can be shown and validated
// rather than silently coerced to a default. Keys: finalDrive, tyreDiameterMm, shiftRpm,
// numberOfGears, and gear-1 … gear-N.
type RawDraft = Record<string, string>

function seedRaw(cfg: TransmissionConfig): RawDraft {
  const r: RawDraft = {
    finalDrive: String(cfg.finalDrive),
    tyreDiameterMm: String(cfg.tyreDiameterMm),
    shiftRpm: String(cfg.shiftRpm),
    numberOfGears: String(cfg.numberOfGears),
  }
  for (let g = 1; g <= cfg.numberOfGears; g++) r[`gear-${g}`] = String(cfg.gearRatios[g] ?? 1.0)
  return r
}

export function TransmissionDialog(props: TransmissionDialogProps) {
  const { open, onClose, config: committedConfig, data, speedUnit, onApply, showToast, defaultConfig } = props
  // Raw draft — every manual edit writes the exact keystroke here; nothing reaches the app until
  // Apply parses + validates it.
  const [raw, setRaw] = useState<RawDraft>(() => seedRaw(committedConfig))
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
  // Only treat a backdrop click as "close" when the press STARTED on the backdrop. Without this a
  // click that begins on a control (e.g. a tab) but whose mouseup drifts onto the backdrop after a
  // layout shift would spuriously close the dialog.
  const backdropPressRef = useRef(false)

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
    setRaw(seedRaw(committedConfig))
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

  // A single raw field edit.
  const setField = (field: string, value: string) => {
    setDirty(true)
    setErrors([])
    setRaw((prev) => {
      const next = { ...prev, [field]: value }
      if (field === "numberOfGears") {
        const n = Number(value)
        // When the count is a valid integer, make sure a raw entry exists for each new gear row.
        if (Number.isInteger(n) && n >= 3 && n <= 10) {
          for (let g = 1; g <= n; g++) if (next[`gear-${g}`] === undefined) next[`gear-${g}`] = "1.0"
        }
      }
      return next
    })
  }

  // Replace the WHOLE draft (preset / auto-detect / import / reset). Re-seeds every raw field.
  const applyWholeConfig = (cfg: TransmissionConfig) => {
    setDirty(true)
    setErrors([])
    setRaw(seedRaw(cfg))
  }

  // Parse a raw field to a number; NaN when blank or non-numeric so validation can flag it.
  const num = (field: string): number => {
    const s = raw[field]
    if (s === undefined || s.trim() === "") return NaN
    const n = Number(s)
    return Number.isFinite(n) ? n : NaN
  }
  // Parsed value for display, falling back to the committed value while a field is mid-edit.
  const numOr = (field: string, fallback: number): number => {
    const n = num(field)
    return Number.isFinite(n) ? n : fallback
  }

  // How many gear rows to render: the parsed count when valid, else the number of existing gear
  // entries, else the committed count.
  const gearCount = useMemo(() => {
    const n = Number(raw.numberOfGears)
    if (Number.isInteger(n) && n >= 3 && n <= 10) return n
    const keys = Object.keys(raw).filter((k) => k.startsWith("gear-"))
    return keys.length >= 3 ? keys.length : committedConfig.numberOfGears
  }, [raw, committedConfig.numberOfGears])

  const gearRows = useMemo(() => Array.from({ length: gearCount }, (_, i) => i + 1), [gearCount])

  // Build a candidate config from the raw draft (numbers may be NaN → the validator rejects them).
  const buildConfig = (): TransmissionConfig => {
    const numberOfGears = num("numberOfGears")
    const count = Number.isInteger(numberOfGears) && numberOfGears >= 3 && numberOfGears <= 10 ? numberOfGears : gearCount
    const gearRatios: Record<number, number> = {}
    for (let g = 1; g <= count; g++) gearRatios[g] = num(`gear-${g}`)
    return {
      finalDrive: num("finalDrive"),
      tyreDiameterMm: num("tyreDiameterMm"),
      shiftRpm: num("shiftRpm"),
      numberOfGears,
      gearRatios,
    }
  }

  const errorFor = (field: string): string | undefined => errors.find((e) => e.field === field)?.message

  const filteredPresets = useMemo(() => {
    let result = TRANSMISSION_PRESETS
    if (presetQuery) {
      const q = presetQuery.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.make.toLowerCase().includes(q))
    }
    if (presetSort === "alphabetical") result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [presetQuery, presetSort])

  if (!open) return null

  const applyAndClose = () => {
    const candidate = buildConfig()
    const found = validateTransmissionConfig(candidate)
    if (found.length > 0) {
      setErrors(found)
      showToast("Fix the highlighted values before applying.")
      return
    }
    onApply(candidate) // commit the validated draft (persists + recomputes gears)
    setDirty(false)
    showToast("Transmission configuration applied")
    onClose()
  }

  // Shift RPM / final drive / tyre used for the predicted-speed preview (display only).
  const previewShift = numOr("shiftRpm", committedConfig.shiftRpm)
  const previewFinalDrive = numOr("finalDrive", committedConfig.finalDrive)
  const previewTyre = numOr("tyreDiameterMm", committedConfig.tyreDiameterMm)

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transmission-dialog-title"
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropPressRef.current) requestClose()
        backdropPressRef.current = false
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
                <NumberField id="tx-final-drive" label="Final Drive Ratio" error={errorFor("finalDrive")}
                  inputMode="decimal" value={raw.finalDrive ?? ""} onChange={(v) => setField("finalDrive", v)} />
                <NumberField id="tx-tyre" label="Tyre Diameter (mm)" error={errorFor("tyreDiameterMm")}
                  inputMode="numeric" value={raw.tyreDiameterMm ?? ""} onChange={(v) => setField("tyreDiameterMm", v)} />
                <NumberField id="tx-shift-rpm" label="Shift RPM" error={errorFor("shiftRpm")}
                  inputMode="numeric" value={raw.shiftRpm ?? ""} onChange={(v) => setField("shiftRpm", v)} />
                <NumberField id="tx-gears" label="Number of Gears" error={errorFor("numberOfGears")}
                  inputMode="numeric" value={raw.numberOfGears ?? ""} onChange={(v) => setField("numberOfGears", v)} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Gear Ratios &amp; predicted speed at {Math.round(previewShift)} RPM</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {gearRows.map((gear) => {
                    const ratio = numOr(`gear-${gear}`, 1.0)
                    const kmh = predictedSpeed(previewShift, ratio, previewFinalDrive, previewTyre)
                    const shown = speedUnit === "mph" ? kmh / 1.609344 : kmh
                    const gerr = errorFor(`gear-${gear}`)
                    const gid = `tx-gear-${gear}`
                    return (
                      <div key={gear} className="rounded-lg border border-border/60 bg-secondary/30 p-2">
                        <label htmlFor={gid} className="mb-1 block text-xs text-muted-foreground">Gear {gear}</label>
                        <Input id={gid} type="text" inputMode="decimal" aria-label={`Gear ${gear} ratio`}
                          aria-invalid={gerr ? true : undefined} aria-describedby={gerr ? `${gid}-error` : undefined}
                          className="h-8 text-sm" value={raw[`gear-${gear}`] ?? ""}
                          onChange={(e) => setField(`gear-${gear}`, e.target.value)} />
                        {gerr && <p id={`${gid}-error`} className="mt-1 text-[11px] text-danger">{gerr}</p>}
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
                        if (parsed) setField("tyreDiameterMm", String(calculateTireDiameter(parsed.width, parsed.aspectRatio, parsed.rimSize)))
                      }} />
                  </Field>
                  <Field label="Calculated diameter">
                    <div className="rounded-md border border-input bg-secondary/50 px-3 py-2 font-mono text-sm tabular-nums">{Math.round(previewTyre)} mm</div>
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
                      <Button size="sm" aria-label={`Use preset ${preset.name}`}
                        onClick={() => { applyWholeConfig(preset.config); showToast(`Loaded "${preset.name}" into the draft`) }}>Use preset</Button>
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
                    applyWholeConfig({ gearRatios: autoResult.gearRatios, finalDrive: autoResult.estimatedFinalDrive, tyreDiameterMm: autoResult.estimatedTireDiameter, shiftRpm: 7000, numberOfGears: maxGear })
                    showToast("Loaded detected settings into the draft")
                  }}>Use detected settings</Button>
                </Card>
              )}
            </TabsContent>

            {/* Import / Export */}
            <TabsContent value="io" className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card className="border-border/70 bg-secondary/30 p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Export</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Save the current configuration to a JSON file.</p>
                  <Button className="w-full" variant="outline" onClick={() => exportTransmissionConfig(committedConfig)}><Download className="mr-2 h-4 w-4" />Export settings</Button>
                </Card>
                <Card className="border-border/70 bg-secondary/30 p-4">
                  <h3 className="mb-2 font-semibold text-foreground">Import</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Load a configuration from a JSON file.</p>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0]
                    // Full-schema validation lives in the importer; an invalid file calls the error
                    // path only, so the current draft is left untouched.
                    if (file) importTransmissionConfig(file, (c) => { applyWholeConfig(c); showToast("Configuration imported into the draft") }, showToast)
                    e.target.value = "" // allow re-importing the same file
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
            <AlertDialogAction onClick={() => { applyWholeConfig(defaultConfig); showToast("Reset to default configuration") }}>Reset</AlertDialogAction>
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

// A text-backed numeric field: shows the raw keystrokes, surfaces a field-level accessible error,
// and never coerces blank/invalid input to a default.
function NumberField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  inputMode?: "decimal" | "numeric"
}) {
  const { id, label, value, onChange, error, inputMode } = props
  const errId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={errId} className="mt-1 text-xs text-danger">{error}</p>}
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
