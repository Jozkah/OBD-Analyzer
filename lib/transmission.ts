import type { TransmissionConfig } from "@/types/obd"
import { validateTransmissionConfig } from "@/lib/transmission-validate"

export function exportTransmissionConfig(config: TransmissionConfig): void {
  const dataStr = JSON.stringify(config, null, 2)
  const dataBlob = new Blob([dataStr], { type: "application/json" })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement("a")
  link.href = url
  link.download = "transmission-config.json"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Coerce arbitrary parsed JSON into a TransmissionConfig shape, or null if it isn't one.
// This only checks structure/types; numeric ranges are the validator's job (below).
export function normalizeTransmissionConfig(parsed: unknown): TransmissionConfig | null {
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  if (
    typeof o.finalDrive !== "number" ||
    typeof o.tyreDiameterMm !== "number" ||
    typeof o.shiftRpm !== "number" ||
    typeof o.numberOfGears !== "number" ||
    !o.gearRatios ||
    typeof o.gearRatios !== "object"
  ) {
    return null
  }
  const gearRatios: Record<number, number> = {}
  for (const [k, v] of Object.entries(o.gearRatios as Record<string, unknown>)) {
    const gear = Number(k)
    if (Number.isInteger(gear) && typeof v === "number") gearRatios[gear] = v
  }
  return {
    finalDrive: o.finalDrive,
    tyreDiameterMm: o.tyreDiameterMm,
    shiftRpm: o.shiftRpm,
    numberOfGears: o.numberOfGears,
    gearRatios,
  }
}

// Parse + fully validate a configuration text. Returns the config or an error message — the pure
// core of the import, so it can be unit-tested without a DOM FileReader.
export function parseTransmissionConfig(text: string): { config: TransmissionConfig } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: "Couldn't read that transmission configuration file." }
  }
  const cfg = normalizeTransmissionConfig(parsed)
  if (!cfg) return { error: "That file isn't a valid transmission configuration." }
  // Validate the COMPLETE schema (ranges, gear ratios) before letting it replace the draft.
  const errors = validateTransmissionConfig(cfg)
  if (errors.length > 0) return { error: `That configuration is invalid: ${errors[0].message}` }
  return { config: cfg }
}

export function importTransmissionConfig(
  file: File,
  callback: (config: TransmissionConfig) => void,
  onError: (message: string) => void,
): void {
  file
    .text()
    .then((text) => {
      const result = parseTransmissionConfig(text)
      if ("error" in result) onError(result.error)
      else callback(result.config)
    })
    .catch(() => onError("Couldn't read that transmission configuration file."))
}
