// Shared domain types for the OBD analyzer. Extracted from app/page.tsx so helper modules
// and components can share them without importing the page component.

export interface DataPoint {
  time: number
  timestamp: string
  rpm: number
  speed: number
  throttle: number
  brake: number
  boost: number
  coolantTemp: number
  intakeTemp: number
  fuelRate: number
  latitude?: number
  longitude?: number
  gear?: number
  steering?: number
  enginePower?: number
  engineTorque?: number
  afr?: number
  ignitionAdvance?: number
  catTemp?: number
  oilTemp?: number
  transTemp?: number
  exhaustTemp?: number
  tripDuration?: number
  tripDistance?: number
  tripFuel?: number
  tripFuelEconomy?: number
  maxSpeed?: number
  // Allow dynamic col_X properties
  [key: string]: any
}

export interface MetricConfig {
  key: keyof DataPoint | string
  label: string
  color: string
  unit: string
  enabled: boolean
  scale?: number
  originalName?: string
}

export interface TransmissionConfig {
  gearRatios: Record<number, number>
  finalDrive: number
  tyreDiameterMm: number
  shiftRpm: number
  numberOfGears: number
}

export type TileStyle = "satellite" | "street" | "terrain"
export type MapStyle = "offline" | TileStyle
