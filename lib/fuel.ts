// Fuel-economy math, kept pure and unit-safe.
//
// L/100km is only meaningful from LITRES and KILOMETRES. The old code fed it a raw Trip Distance
// value (which may be miles) and raw Trip Fuel (which may be gallons) and always printed "L/100km",
// producing a dimensionally wrong number. These helpers convert to the canonical units first and
// return null when the imported units can't support the calculation, so the UI hides the value
// rather than guessing.

const US_GAL_TO_L = 3.785411784

/** Convert a fuel quantity to litres, or null when the unit is unknown/unsupported. */
export function fuelToLitres(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  const u = (unit ?? "").trim().toLowerCase()
  // No explicit unit → assume litres (the OBD-II convention and this app's default).
  if (u === "" || /^(l|lt|ltr|liter|litre)/.test(u)) return value
  if (/gal/.test(u)) return value * US_GAL_TO_L
  return null // %, kWh, unknown — cannot express as litres
}

/** L/100km from litres and kilometres, or null when either is missing or distance is ~0. */
export function computeFuelEconomyL100km(litres: number | null, km: number | null): number | null {
  if (litres == null || km == null || !Number.isFinite(litres) || !Number.isFinite(km)) return null
  if (km <= 0) return null
  return (litres / km) * 100
}
