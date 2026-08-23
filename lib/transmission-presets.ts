import type { TransmissionConfig } from "@/types/obd"

export interface TransmissionPreset {
  name: string
  /** Manufacturer, for grouping/sorting the preset picker. */
  make: string
  config: TransmissionConfig
}

export const TRANSMISSION_PRESETS: TransmissionPreset[] = [
  {
    name: "Peugeot 308 GTi (T9 EA71)",
    make: "Peugeot",
    config: { gearRatios: { 1: 3.358, 2: 1.92, 3: 1.433, 4: 1.103, 5: 0.881, 6: 0.745 }, finalDrive: 4.176, tyreDiameterMm: 647, shiftRpm: 6700, numberOfGears: 6 },
  },
  {
    name: "Peugeot 308 GT (T9 EA65)",
    make: "Peugeot",
    config: { gearRatios: { 1: 3.538, 2: 1.92, 3: 1.323, 4: 1.026, 5: 0.822, 6: 0.681 }, finalDrive: 4.35, tyreDiameterMm: 647, shiftRpm: 6900, numberOfGears: 6 },
  },
  {
    name: "Honda Civic Type R (FK8)",
    make: "Honda",
    config: { gearRatios: { 1: 3.267, 2: 1.967, 3: 1.428, 4: 1.073, 5: 0.83, 6: 0.647 }, finalDrive: 4.785, tyreDiameterMm: 645, shiftRpm: 7000, numberOfGears: 6 },
  },
  {
    name: "BMW M3 (F80)",
    make: "BMW",
    config: { gearRatios: { 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1.0, 7: 0.839 }, finalDrive: 3.15, tyreDiameterMm: 685, shiftRpm: 7200, numberOfGears: 7 },
  },
  {
    name: "Subaru WRX STI",
    make: "Subaru",
    config: { gearRatios: { 1: 3.636, 2: 2.235, 3: 1.521, 4: 1.137, 5: 0.971, 6: 0.756 }, finalDrive: 4.444, tyreDiameterMm: 650, shiftRpm: 6800, numberOfGears: 6 },
  },
  {
    name: "Porsche 911 GT3",
    make: "Porsche",
    config: { gearRatios: { 1: 3.5, 2: 2.118, 3: 1.36, 4: 1.054, 5: 0.853, 6: 0.707 }, finalDrive: 4.105, tyreDiameterMm: 680, shiftRpm: 9000, numberOfGears: 6 },
  },
  {
    name: "Nissan GT-R R35",
    make: "Nissan",
    config: { gearRatios: { 1: 4.056, 2: 2.301, 3: 1.595, 4: 1.248, 5: 1.001, 6: 0.796 }, finalDrive: 3.794, tyreDiameterMm: 690, shiftRpm: 7000, numberOfGears: 6 },
  },
]
