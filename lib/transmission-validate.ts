import type { TransmissionConfig } from "@/types/obd"

export interface ValidationError {
  field: string
  message: string
}

// Validates a transmission draft before it is applied. Bounds are generous — they exist to catch
// zero/negative/nonsensical values that would corrupt gear estimation, not to police real setups.
export function validateTransmissionConfig(cfg: TransmissionConfig): ValidationError[] {
  const errors: ValidationError[] = []

  if (!(cfg.finalDrive > 0) || cfg.finalDrive > 15) {
    errors.push({ field: "finalDrive", message: "Final drive must be greater than 0 (and below 15)." })
  }
  if (!(cfg.tyreDiameterMm > 0) || cfg.tyreDiameterMm < 200 || cfg.tyreDiameterMm > 1500) {
    errors.push({ field: "tyreDiameterMm", message: "Tyre diameter must be between 200 and 1500 mm." })
  }
  if (!(cfg.shiftRpm > 0) || cfg.shiftRpm > 20000) {
    errors.push({ field: "shiftRpm", message: "Shift RPM must be between 1 and 20000." })
  }
  if (!Number.isInteger(cfg.numberOfGears) || cfg.numberOfGears < 3 || cfg.numberOfGears > 10) {
    errors.push({ field: "numberOfGears", message: "Number of gears must be a whole number from 3 to 10." })
  }
  for (let g = 1; g <= cfg.numberOfGears; g++) {
    const ratio = cfg.gearRatios[g]
    if (!(typeof ratio === "number" && ratio > 0)) {
      errors.push({ field: `gear-${g}`, message: `Gear ${g} ratio must be greater than 0.` })
    }
  }

  return errors
}

export function isTransmissionConfigValid(cfg: TransmissionConfig): boolean {
  return validateTransmissionConfig(cfg).length === 0
}
