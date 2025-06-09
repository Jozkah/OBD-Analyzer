"use client"

import { useState, useEffect, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { FileUpload } from "@/components/file-upload"
import { MetricChart } from "@/components/metric-chart"
import { MetricSelector } from "@/components/metric-selector"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Info, Settings, FileText } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Link from "next/link"

// Common automotive data names and their abbreviations
const commonAutomotiveDataNames: Record<string, string> = {
  rpm: "Engine RPM",
  speed: "Vehicle Speed",
  throttle_position: "Throttle Position",
  engine_load: "Engine Load",
  coolant_temp: "Coolant Temperature",
  intake_temp: "Intake Temperature",
  maf: "Mass Air Flow",
  map: "Manifold Pressure",
  timing_advance: "Timing Advance",
  fuel_level: "Fuel Level",
  fuel_pressure: "Fuel Pressure",
  fuel_rate: "Fuel Rate",
  fuel_trim_short_term_bank_1: "ST Fuel Trim B1",
  fuel_trim_long_term_bank_1: "LT Fuel Trim B1",
  fuel_trim_short_term_bank_2: "ST Fuel Trim B2",
  fuel_trim_long_term_bank_2: "LT Fuel Trim B2",
  o2_sensor_1_voltage: "O2 Sensor 1 Voltage",
  o2_sensor_2_voltage: "O2 Sensor 2 Voltage",
  egr: "EGR",
  barometric_pressure: "Barometric Pressure",
  catalyst_temp: "Catalyst Temperature",
  ambient_air_temp: "Ambient Air Temp",
  oil_temp: "Oil Temperature",
  acceleration: "Acceleration",
  gear: "Current Gear",
  voltage: "Battery Voltage",
  afr: "Air/Fuel Ratio",
  lambda: "Lambda",
  boost: "Boost Pressure",
  knock: "Knock",
  wheel_speed_fl: "Wheel Speed FL",
  wheel_speed_fr: "Wheel Speed FR",
  wheel_speed_rl: "Wheel Speed RL",
  wheel_speed_rr: "Wheel Speed RR",
  latitude: "GPS Latitude",
  longitude: "GPS Longitude",
  altitude: "GPS Altitude",
  heading: "GPS Heading",
  gps_speed: "GPS Speed",
  lateral_g: "Lateral G-Force",
  longitudinal_g: "Longitudinal G-Force",
  vertical_g: "Vertical G-Force",
  yaw_rate: "Yaw Rate",
  pitch: "Pitch",
  roll: "Roll",
  intake_pressure: "Intake Pressure",
  exhaust_pressure: "Exhaust Pressure",
  turbo_rpm: "Turbo RPM",
  turbo_pressure: "Turbo Pressure",
  wastegate: "Wastegate Position",
  ignition_timing: "Ignition Timing",
  cam_position: "Cam Position",
  transmission_temp: "Transmission Temp",
  torque: "Engine Torque",
  wheel_torque: "Wheel Torque",
  power: "Engine Power",
  wheel_power: "Wheel Power",
  injector_duty_cycle: "Injector Duty Cycle",
  injector_pulse_width: "Injector Pulse Width",
  ethanol_content: "Ethanol Content",
  oil_pressure: "Oil Pressure",
  fuel_consumption: "Fuel Consumption",
  distance: "Distance",
  time: "Time",
  lap_time: "Lap Time",
  sector_time: "Sector Time",
  brake_pressure: "Brake Pressure",
  steering_angle: "Steering Angle",
  clutch_position: "Clutch Position",
  accelerator_position: "Accelerator Position",
  brake_position: "Brake Position",
  gear_ratio: "Gear Ratio",
  differential_speed: "Differential Speed",
  differential_temp: "Differential Temp",
  tire_pressure_fl: "Tire Pressure FL",
  tire_pressure_fr: "Tire Pressure FR",
  tire_pressure_rl: "Tire Pressure RL",
  tire_pressure_rr: "Tire Pressure RR",
  tire_temp_fl: "Tire Temp FL",
  tire_temp_fr: "Tire Temp FR",
  tire_temp_rl: "Tire Temp RL",
  tire_temp_rr: "Tire Temp RR",
  suspension_travel_fl: "Suspension FL",
  suspension_travel_fr: "Suspension FR",
  suspension_travel_rl: "Suspension RL",
  suspension_travel_rr: "Suspension RR",
  ride_height_fl: "Ride Height FL",
  ride_height_fr: "Ride Height FR",
  ride_height_rl: "Ride Height RL",
  ride_height_rr: "Ride Height RR",
  damper_position_fl: "Damper Pos FL",
  damper_position_fr: "Damper Pos FR",
  damper_position_rl: "Damper Pos RL",
  damper_position_rr: "Damper Pos RR",
  brake_temp_fl: "Brake Temp FL",
  brake_temp_fr: "Brake Temp FR",
  brake_temp_rl: "Brake Temp RL",
  brake_temp_rr: "Brake Temp RR",
  brake_bias: "Brake Bias",
  wing_position: "Wing Position",
  drag_reduction_system: "DRS",
  traction_control: "Traction Control",
  abs: "ABS",
  stability_control: "Stability Control",
  launch_control: "Launch Control",
  pit_limiter: "Pit Limiter",
  fuel_remaining: "Fuel Remaining",
  fuel_used: "Fuel Used",
  fuel_laps_remaining: "Fuel Laps Remaining",
  lap_number: "Lap Number",
  lap_validity: "Lap Validity",
  sector_number: "Sector Number",
  sector_validity: "Sector Validity",
  track_temperature: "Track Temperature",
  air_density: "Air Density",
  relative_humidity: "Relative Humidity",
  session_time: "Session Time",
  session_time_left: "Session Time Left",
  flag_status: "Flag Status",
  rain_intensity: "Rain Intensity",
  wind_speed: "Wind Speed",
  wind_direction: "Wind Direction",
  slip_ratio: "Slip Ratio",
  slip_angle: "Slip Angle",
  downforce: "Downforce",
  drag: "Drag",
  aero_balance: "Aero Balance",
  mechanical_balance: "Mechanical Balance",
  brake_migration: "Brake Migration",
  differential_preload: "Diff Preload",
  differential_power: "Diff Power",
  differential_coast: "Diff Coast",
  differential_preload_adj: "Diff Preload Adj",
  differential_power_adj: "Diff Power Adj",
  differential_coast_adj: "Diff Coast Adj",
  front_arb: "Front ARB",
  rear_arb: "Rear ARB",
  front_toe: "Front Toe",
  rear_toe: "Rear Toe",
  front_camber: "Front Camber",
  rear_camber: "Rear Camber",
  front_caster: "Front Caster",
  front_ride_height: "Front Ride Height",
  rear_ride_height: "Rear Ride Height",
  front_spring_rate: "Front Spring Rate",
  rear_spring_rate: "Rear Spring Rate",
  front_damper_bump: "Front Damper Bump",
  front_damper_rebound: "Front Damper Rebound",
  rear_damper_bump: "Rear Damper Bump",
  rear_damper_rebound: "Rear Damper Rebound",
  front_wing: "Front Wing",
  rear_wing: "Rear Wing",
  brake_pressure_bias: "Brake Pressure Bias",
  brake_migration_adj: "Brake Migration Adj",
  engine_braking: "Engine Braking",
  engine_braking_adj: "Engine Braking Adj",
  engine_map: "Engine Map",
  fuel_mix: "Fuel Mix",
  ers_deploy_mode: "ERS Deploy Mode",
  ers_harvest_mode: "ERS Harvest Mode",
  ers_stored: "ERS Stored",
  ers_deployed: "ERS Deployed",
  ers_harvested: "ERS Harvested",
  mgu_k_deployed: "MGU-K Deployed",
  mgu_k_harvested: "MGU-K Harvested",
  mgu_h_deployed: "MGU-H Deployed",
  mgu_h_harvested: "MGU-H Harvested",
  ice_energy: "ICE Energy",
  electrical_energy: "Electrical Energy",
  total_energy: "Total Energy",
  energy_store_charge: "Energy Store Charge",
  energy_store_temperature: "Energy Store Temp",
  mgu_k_temperature: "MGU-K Temp",
  mgu_h_temperature: "MGU-H Temp",
  ice_temperature: "ICE Temp",
  ice_pressure: "ICE Pressure",
  ice_torque: "ICE Torque",
  ice_power: "ICE Power",
  mgu_k_torque: "MGU-K Torque",
  mgu_k_power: "MGU-K Power",
  mgu_h_torque: "MGU-H Torque",
  mgu_h_power: "MGU-H Power",
  total_torque: "Total Torque",
  total_power: "Total Power",
  ice_rpm: "ICE RPM",
  mgu_k_rpm: "MGU-K RPM",
  mgu_h_rpm: "MGU-H RPM",
  turbo_rpm: "Turbo RPM",
  ice_throttle: "ICE Throttle",
  mgu_k_throttle: "MGU-K Throttle",
  mgu_h_throttle: "MGU-H Throttle",
  turbo_boost: "Turbo Boost",
  turbo_waste_gate: "Turbo Waste Gate",
  ice_fuel_flow: "ICE Fuel Flow",
  ice_air_flow: "ICE Air Flow",
  ice_air_fuel_ratio: "ICE Air Fuel Ratio",
  ice_ignition_timing: "ICE Ignition Timing",
  ice_injection_timing: "ICE Injection Timing",
  ice_cylinder_head_temp: "ICE Cylinder Head Temp",
  ice_exhaust_temp: "ICE Exhaust Temp",
  ice_inlet_temp: "ICE Inlet Temp",
  ice_coolant_temp: "ICE Coolant Temp",
  ice_oil_temp: "ICE Oil Temp",
  ice_oil_pressure: "ICE Oil Pressure",
  ice_crank_case_pressure: "ICE Crank Case Pressure",
  ice_throttle_position: "ICE Throttle Position",
  ice_throttle_target: "ICE Throttle Target",
  ice_wastegate_position: "ICE Wastegate Position",
  ice_wastegate_target: "ICE Wastegate Target",
  ice_turbo_speed: "ICE Turbo Speed",
  ice_turbo_pressure: "ICE Turbo Pressure",
  ice_turbo_temp: "ICE Turbo Temp",
  ice_gear: "ICE Gear",
  ice_gear_shift: "ICE Gear Shift",
  ice_clutch: "ICE Clutch",
  ice_clutch_target: "ICE Clutch Target",
  ice_torque_request: "ICE Torque Request",
  ice_torque_actual: "ICE Torque Actual",
  ice_power_request: "ICE Power Request",
  ice_power_actual: "ICE Power Actual",
  ice_fuel_consumption: "ICE Fuel Consumption",
  ice_fuel_economy: "ICE Fuel Economy",
  ice_fuel_level: "ICE Fuel Level",
  ice_fuel_pressure: "ICE Fuel Pressure",
  ice_fuel_temp: "ICE Fuel Temp",
  ice_fuel_trim: "ICE Fuel Trim",
  ice_fuel_trim_short_term: "ICE Fuel Trim Short Term",
  ice_fuel_trim_long_term: "ICE Fuel Trim Long Term",
  ice_fuel_trim_bank_1: "ICE Fuel Trim Bank 1",
  ice_fuel_trim_bank_2: "ICE Fuel Trim Bank 2",
  ice_fuel_trim_bank_1_short_term: "ICE Fuel Trim Bank 1 Short Term",
  ice_fuel_trim_bank_2_short_term: "ICE Fuel Trim Bank 2 Short Term",
  ice_fuel_trim_bank_1_long_term: "ICE Fuel Trim Bank 1 Long Term",
  ice_fuel_trim_bank_2_long_term: "ICE Fuel Trim Bank 2 Long Term",
  ice_lambda: "ICE Lambda",
  ice_lambda_target: "ICE Lambda Target",
  ice_lambda_bank_1: "ICE Lambda Bank 1",
  ice_lambda_bank_2: "ICE Lambda Bank 2",
  ice_lambda_bank_1_target: "ICE Lambda Bank 1 Target",
  ice_lambda_bank_2_target: "ICE Lambda Bank 2 Target",
  ice_lambda_bank_1_error: "ICE Lambda Bank 1 Error",
  ice_lambda_bank_2_error: "ICE Lambda Bank 2 Error",
  ice_lambda_control: "ICE Lambda Control",
  ice_lambda_control_bank_1: "ICE Lambda Control Bank 1",
  ice_lambda_control_bank_2: "ICE Lambda Control Bank 2",
  ice_knock: "ICE Knock",
  ice_knock_bank_1: "ICE Knock Bank 1",
  ice_knock_bank_2: "ICE Knock Bank 2",
  ice_knock_cyl_1: "ICE Knock Cyl 1",
  ice_knock_cyl_2: "ICE Knock Cyl 2",
  ice_knock_cyl_3: "ICE Knock Cyl 3",
  ice_knock_cyl_4: "ICE Knock Cyl 4",
  ice_knock_cyl_5: "ICE Knock Cyl 5",
  ice_knock_cyl_6: "ICE Knock Cyl 6",
  ice_knock_cyl_7: "ICE Knock Cyl 7",
  ice_knock_cyl_8: "ICE Knock Cyl 8",
  ice_knock_cyl_9: "ICE Knock Cyl 9",
  ice_knock_cyl_10: "ICE Knock Cyl 10",
  ice_knock_cyl_11: "ICE Knock Cyl 11",
  ice_knock_cyl_12: "ICE Knock Cyl 12",
  ice_misfire: "ICE Misfire",
  ice_misfire_bank_1: "ICE Misfire Bank 1",
  ice_misfire_bank_2: "ICE Misfire Bank 2",
  ice_misfire_cyl_1: "ICE Misfire Cyl 1",
  ice_misfire_cyl_2: "ICE Misfire Cyl 2",
  ice_misfire_cyl_3: "ICE Misfire Cyl 3",
  ice_misfire_cyl_4: "ICE Misfire Cyl 4",
  ice_misfire_cyl_5: "ICE Misfire Cyl 5",
  ice_misfire_cyl_6: "ICE Misfire Cyl 6",
  ice_misfire_cyl_7: "ICE Misfire Cyl 7",
  ice_misfire_cyl_8: "ICE Misfire Cyl 8",
  ice_misfire_cyl_9: "ICE Misfire Cyl 9",
  ice_misfire_cyl_10: "ICE Misfire Cyl 10",
  ice_misfire_cyl_11: "ICE Misfire Cyl 11",
  ice_misfire_cyl_12: "ICE Misfire Cyl 12",
}

// Function to get a better name for a metric
const getBetterMetricName = (name: string): string => {
  // Convert to lowercase and replace underscores with spaces for lookup
  const lookupName = name.toLowerCase().replace(/ /g, "_")

  // Check if we have a predefined better name
  if (commonAutomotiveDataNames[lookupName]) {
    return commonAutomotiveDataNames[lookupName]
  }

  // If not found in our dictionary, make a best effort to format it nicely
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// Function to get unit for a metric based on its name
const getUnitForMetric = (name: string): string => {
  const lowerName = name.toLowerCase()

  if (lowerName.includes("temp") || lowerName.includes("temperature")) return "°C"
  if (lowerName.includes("speed") || lowerName.includes("velocity")) return "km/h"
  if (lowerName.includes("rpm")) return "RPM"
  if (lowerName.includes("pressure")) return "kPa"
  if (lowerName.includes("position") || lowerName.includes("level") || lowerName.includes("ratio")) return "%"
  if (lowerName.includes("voltage")) return "V"
  if (lowerName.includes("current")) return "A"
  if (lowerName.includes("power")) return "kW"
  if (lowerName.includes("torque")) return "Nm"
  if (lowerName.includes("consumption")) return "L/100km"
  if (lowerName.includes("economy")) return "km/L"
  if (lowerName.includes("distance")) return "km"
  if (lowerName.includes("time") && !lowerName.includes("timing")) return "s"
  if (lowerName.includes("angle")) return "°"
  if (lowerName.includes("force") || lowerName.includes("_g")) return "g"
  if (lowerName.includes("flow")) return "g/s"
  if (lowerName.includes("lambda")) return "λ"
  if (lowerName.includes("afr")) return "AFR"
  if (lowerName.includes("gear")) return ""
  if (lowerName.includes("latitude") || lowerName.includes("longitude")) return "°"
  if (lowerName.includes("altitude")) return "m"
  if (lowerName.includes("heading")) return "°"

  return ""
}

// Transmission presets
const transmissionPresets = [
  {
    name: "Honda Civic Type R (FK8)",
    finalDrive: 4.11,
    gearRatios: [3.625, 2.115, 1.678, 1.285, 1.065, 0.843],
  },
  {
    name: "Toyota GR86 / Subaru BRZ",
    finalDrive: 4.1,
    gearRatios: [3.626, 2.188, 1.541, 1.213, 1.0, 0.767],
  },
  {
    name: "BMW M3 (G80)",
    finalDrive: 3.46,
    gearRatios: [4.11, 2.32, 1.54, 1.18, 1.0, 0.85, 0.71, 0.58],
  },
  {
    name: "Porsche 911 GT3 (992)",
    finalDrive: 3.09,
    gearRatios: [3.75, 2.38, 1.72, 1.34, 1.11, 0.95, 0.81],
  },
  {
    name: "Ford Mustang GT (S550)",
    finalDrive: 3.55,
    gearRatios: [4.17, 2.34, 1.52, 1.14, 0.87, 0.69],
  },
  {
    name: "Chevrolet Corvette C8",
    finalDrive: 5.2,
    gearRatios: [4.89, 3.08, 2.05, 1.46, 1.12, 0.91, 0.76, 0.62],
  },
  {
    name: "Volkswagen Golf GTI (Mk8)",
    finalDrive: 3.24,
    gearRatios: [3.78, 2.27, 1.53, 1.12, 0.92, 0.76],
  },
  {
    name: "Mazda MX-5 Miata (ND)",
    finalDrive: 2.87,
    gearRatios: [5.09, 2.99, 2.04, 1.59, 1.29, 1.0],
  },
  {
    name: "Nissan 370Z",
    finalDrive: 3.69,
    gearRatios: [3.79, 2.33, 1.62, 1.27, 1.0, 0.79],
  },
  {
    name: "Audi RS3",
    finalDrive: 4.17,
    gearRatios: [3.56, 2.53, 1.68, 1.02, 0.79, 0.65, 0.52],
  },
  {
    name: "Mercedes-AMG A45",
    finalDrive: 4.17,
    gearRatios: [3.86, 2.43, 1.67, 1.23, 0.96, 0.78, 0.63, 0.5],
  },
  {
    name: "Subaru WRX STI",
    finalDrive: 3.9,
    gearRatios: [3.64, 2.24, 1.52, 1.14, 0.97, 0.76],
  },
  {
    name: "Mitsubishi Lancer Evolution X",
    finalDrive: 4.06,
    gearRatios: [3.66, 2.37, 1.76, 1.35, 1.0, 0.76],
  },
  {
    name: "Toyota Supra (A90)",
    finalDrive: 3.15,
    gearRatios: [5.25, 3.36, 2.17, 1.72, 1.32, 1.0, 0.82, 0.64],
  },
  {
    name: "Hyundai i30N",
    finalDrive: 4.33,
    gearRatios: [3.08, 1.97, 1.35, 1.09, 0.88, 0.74],
  },
  {
    name: "Custom",
    finalDrive: 4.1,
    gearRatios: [3.63, 2.12, 1.53, 1.13, 0.85, 0.69],
  },
]

// Function to parse CSV data
const parseCSV = (csvData: string) => {
  const lines = csvData.split("\n")
  const headers = lines[0].split(",")

  const data = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line) {
      const values = line.split(",")
      const entry: Record<string, number> = {}

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j].trim()
        const value = Number.parseFloat(values[j])
        if (!isNaN(value)) {
          entry[header] = value
        }
      }

      // Calculate gear if we have RPM and speed data
      if (entry["RPM"] && entry["Speed"]) {
        // This will be updated in the transmission config
        entry["Gear"] = calculateGear(entry["Speed"], entry["RPM"])
      }

      data.push(entry)
    }
  }

  return { data, headers }
}

// Function to calculate gear based on speed and RPM
const calculateGear = (speed: number, rpm: number, config?: any) => {
  // Default values if no config provided
  const finalDrive = config?.finalDrive || 4.1
  const gearRatios = config?.gearRatios || [3.63, 2.12, 1.53, 1.13, 0.85, 0.69]
  const wheelDiameter = config?.wheelDiameter || 0.65 // meters

  // Convert speed from km/h to m/s
  const speedMS = speed / 3.6

  // Calculate theoretical RPM for each gear
  const theoreticalRPMs = gearRatios.map((ratio) => {
    // RPM = (speed in m/s) * (60 s/min) * (final drive ratio) * (gear ratio) / (π * wheel diameter in m)
    return (speedMS * 60 * finalDrive * ratio) / (Math.PI * wheelDiameter)
  })

  // Find the gear with the closest theoretical RPM to actual RPM
  let closestGear = 1
  let minDifference = Math.abs(theoreticalRPMs[0] - rpm)

  for (let i = 1; i < theoreticalRPMs.length; i++) {
    const difference = Math.abs(theoreticalRPMs[i] - rpm)
    if (difference < minDifference) {
      minDifference = difference
      closestGear = i + 1
    }
  }

  return closestGear
}

export function Dashboard() {
  const [data, setData] = useState<any[]>([])
  const [metrics, setMetrics] = useState<string[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 100])
  const [activeTab, setActiveTab] = useState('overview')
  const [hoveredDataPoint, setHoveredDataPoint] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOption, setSortOption] = useState('original')
  const [transmissionConfig, setTransmissionConfig] = useState({
    preset: "Custom",
    finalDrive: 4.10,
    gearRatios: [3.63, 2.12, 1.53, 1.13, 0.85, 0.69],
    wheelDiameter: 0.65, // in meters
    tireWidth: 225, // in mm
    aspectRatio: 45, // percentage
    rimDiameter: 17, // in inches
  })
  
  // Function to load sample data
  const loadSampleData = useCallback(async () => {
    try {
      const response = await fetch('/sample-data.csv')
      const csvData = await response.text()
      const { data, headers } = parseCSV(csvData)
      setData(data)
      
      // Extract all available metrics from headers
      const availableMetrics = headers.filter(header => header.trim() !== '')
      setMetrics(availableMetrics)
      
      // Select default metrics
      const defaultMetrics = ['RPM', 'Speed', 'Throttle']
      const metricsToSelect = defaultMetrics.filter(metric => 
        availableMetrics.includes(metric)
      )
      
      // If none of the default metrics are available, select the first few
      if (metricsToSelect.length === 0 && availableMetrics.length > 0) {
        setSelectedMetrics(availableMetrics.slice(0, 3))
      } else {
        setSelectedMetrics(metricsToSelect)
      }
    } catch (error) {
      console.error('Error loading sample data:', error)
    }
  }, [])
  
  // Function to handle file upload
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const csvData = e.target?.result as string
      const { data, headers } = parseCSV(csvData)
      setData(data)
      
      // Extract all available metrics from headers
      const availableMetrics = headers.filter(header => header.trim() !== '')
      setMetrics(availableMetrics)
      
      // Select default metrics
      const defaultMetrics = ['RPM', 'Speed', 'Throttle']
      const metricsToSelect = defaultMetrics.filter(metric => 
        availableMetrics.includes(metric)
      )
      
      // If none of the default metrics are available, select the first few
      if (metricsToSelect.length === 0 && availableMetrics.length > 0) {
        setSelectedMetrics(availableMetrics.slice(0, 3))
      } else {
        setSelectedMetrics(metricsToSelect)
      }
    }
    reader.readAsText(file)
  }, [])
  
  // Function to handle metric selection
  const handleMetricSelect = useCallback((metric: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        return prev.filter(m => m !== metric)
      } else {
        return [...prev, metric]
      }
    })
  }, [])
  
  // Function to handle time range change
  const handleTimeRangeChange = useCallback((value: number[]) => {
    setTimeRange([value[0], value[1]])
  }, [])
  
  // Function to handle data point hover
  const handleDataPointHover = useCallback((index: number | null) => {
    setHoveredDataPoint(index)
  }, [])
  
  // Function to update transmission config
  const updateTransmissionConfig = useCallback((config: any) => {
    setTransmissionConfig(config)
    
    // Recalculate gears for all data points
    if (data.length > 0) {
      const updatedData = data.map(point => {
        if (point['RPM'] && point['Speed']) {
          return {
            ...point,
            'Gear': calculateGear(point['Speed'], point['RPM'], config)
          }
        }
        return point
      })
      setData(updatedData)
    }
  }, [data])
  
  // Function to calculate tire diameter
  const calculateTireDiameter = useCallback((width: number, aspectRatio: number, rimDiameter: number) => {
    // Convert rim diameter from inches to mm
    const rimDiameterMM = rimDiameter * 25.4
    
    // Calculate sidewall height in mm
    const sidewallHeight = (width * aspectRatio) / 100
    
    // Calculate total diameter in mm
    const totalDiameterMM = rimDiameterMM + (2 * sidewallHeight)
    
    // Convert to meters
    return totalDiameterMM / 1000
  }, [])
  
  // Effect to load sample data on component mount
  useEffect(() => {
    loadSampleData()
  }, [loadSampleData])
  
  // Filter metrics based on search term
  const filteredMetrics = metrics.filter(metric => 
    metric.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  // Sort metrics based on sort option
  const sortedMetrics = [...filteredMetrics].sort((a, b) => {
    if (sortOption === 'alphabetical') {
      return a.localeCompare(b)
    }
    // For 'original', maintain the order they were in the CSV
    return metrics.indexOf(a) - metrics.indexOf(b)
  })
  
  // Filter data based on time range
  const filteredData = data.slice(
    Math.floor(data.length * (timeRange[0] / 100)),
    Math.ceil(data.length * (timeRange[1] / 100))
  )
  
  // Calculate gear distribution
  const gearDistribution = filteredData.reduce((acc: Record<number, number>, point) => {
    const gear = point['Gear']
    if (gear !== undefined) {
      acc[gear] = (acc[gear] || 0) + 1
    }
    return acc
  }, {})
  
  // Ensure all gears are represented in the distribution
  const maxGear = transmissionConfig.gearRatios.length
  for (let i = 1; i <= maxGear; i++) {
    if (gearDistribution[i] === undefined) {
      gearDistribution[i] = 0
    }
  }
  
  // Calculate gear distribution percentages
  const totalGearPoints = Object.values(gearDistribution).reduce((sum, count) => sum + (count as number), 0)
  const gearDistributionPercentages = Object.entries(gearDistribution).map(([gear, count]) => ({
    gear: Number.parseInt(gear),
    percentage: totalGearPoints > 0 ? ((count as number) / totalGearPoints) * 100 : 0
  }))
  
  // Sort gear distribution by gear number
  gearDistributionPercentages.sort((a, b) => a.gear - b.gear)
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">Automotive Data Analyzer</h1>
          <div className="flex items-center gap-4">
            <Link href="/changelogs" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Changelogs</span>
            </Link>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Settings className="h-4 w-4" />
                        <span className="hidden sm:inline">Transmission</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Transmission Configuration</DialogTitle>
                        <DialogDescription>
                          Configure your vehicle's transmission details for accurate gear calculations.
                        </DialogDescription>
                      </DialogHeader>
                      <Tabs defaultValue="preset">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="preset">Presets</TabsTrigger>
                          <TabsTrigger value="custom">Custom</TabsTrigger>
                        </TabsList>
                        <TabsContent value="preset" className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="preset">Select Transmission Preset</Label>
                            <Select 
                              defaultValue={transmissionConfig.preset}
                              onValueChange={(value) => {
                                const preset = transmissionPresets.find(p => p.name === value)
                                if (preset) {
                                  updateTransmissionConfig({
                                    ...transmissionConfig,
                                    preset: value,
                                    finalDrive: preset.finalDrive,
                                    gearRatios: [...preset.gearRatios]
                                  })
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a preset" />
                              </SelectTrigger>
                              <SelectContent>
                                {transmissionPresets.map((preset) => (
                                  <SelectItem key={preset.name} value={preset.name}>
                                    {preset.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Final Drive Ratio: {transmissionConfig.finalDrive}</Label>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Gear Ratios:</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {transmissionConfig.gearRatios.map((ratio, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{index + 1}:</span>
                                  <span className="text-sm">{ratio}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="custom" className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="finalDrive">Final Drive Ratio</Label>
                            <div className="flex items-center gap-2">
                              <Input 
                                id="finalDrive"
                                type="number"
                                step="0.01"
                                value={transmissionConfig.finalDrive}
                                onChange={(e) => {
                                  const value = Number.parseFloat(e.target.value)
                                  if (!isNaN(value) && value > 0) {
                                    updateTransmissionConfig({
                                      ...transmissionConfig,
                                      preset: "Custom",
                                      finalDrive: value
                                    })
                                  }
                                }}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Gear Ratios</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {transmissionConfig.gearRatios.map((ratio, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{index + 1}:</span>
                                  <Input 
                                    type="number"
                                    step="0.01"
                                    value={ratio}
                                    onChange={(e) => {
                                      const value = Number.parseFloat(e.target.value)
                                      if (!isNaN(value) && value > 0) {
                                        const newRatios = [...transmissionConfig.gearRatios]
                                        newRatios[index] = value
                                        updateTransmissionConfig({
                                          ...transmissionConfig,
                                          preset: "Custom",
                                          gearRatios: newRatios
                                        })
                                      }
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between mt-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  if (transmissionConfig.gearRatios.length < 10) {
                                    const newRatios = [...transmissionConfig.gearRatios, 0.5]
                                    updateTransmissionConfig({
                                      ...transmissionConfig,
                                      preset: "Custom",
                                      gearRatios: newRatios
                                    })
                                  }
                                }}
                              >
                                Add Gear
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  if (transmissionConfig.gearRatios.length > 1) {
                                    const newRatios = transmissionConfig.gearRatios.slice(0, -1)
                                    updateTransmissionConfig({
                                      ...transmissionConfig,
                                      preset: "Custom",
                                      gearRatios: newRatios
                                    })
                                  }
                                }}
                              >
                                Remove Gear
                              </Button>
                            </div>
                          </div>
                          
                          <Separator />
                          
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">Tire Size Calculator</h4>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor="tireWidth" className="text-xs">Width (mm)</Label>
                                  <Input 
                                    id="tireWidth"
                                    type="number"
                                    value={transmissionConfig.tireWidth}
                                    onChange={(e) => {
                                      const value = Number.parseInt(e.target.value)
                                      if (!isNaN(value) && value > 0) {
                                        const newConfig = {
                                          ...transmissionConfig,
                                          tireWidth: value
                                        }
                                        // Calculate new wheel diameter
                                        newConfig.wheelDiameter = calculateTireDiameter(
                                          value, 
                                          transmissionConfig.aspectRatio, 
                                          transmissionConfig.rimDiameter
                                        )
                                        updateTransmissionConfig(newConfig)
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="aspectRatio" className="text-xs">Aspect Ratio (%)</Label>
                                  <Input 
                                    id="aspectRatio"
                                    type="number"
                                    value={transmissionConfig.aspectRatio}
                                    onChange={(e) => {
                                      const value = Number.parseInt(e.target.value)
                                      if (!isNaN(value) && value > 0) {
                                        const newConfig = {
                                          ...transmissionConfig,
                                          aspectRatio: value
                                        }
                                        // Calculate new wheel diameter
                                        newConfig.wheelDiameter = calculateTireDiameter(
                                          transmissionConfig.tireWidth, 
                                          value, 
                                          transmissionConfig.rimDiameter
                                        )
                                        updateTransmissionConfig(newConfig)
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="rimDiameter" className="text-xs">Rim (inches)</Label>
                                  <Input 
                                    id="rimDiameter"
                                    type="number"
                                    value={transmissionConfig.rimDiameter}
                                    onChange={(e) => {
                                      const value = Number.parseInt(e.target.value)
                                      if (!isNaN(value) && value > 0) {
                                        const newConfig = {
                                          ...transmissionConfig,
                                          rimDiameter: value
                                        }
                                        // Calculate new wheel diameter
                                        newConfig.wheelDiameter = calculateTireDiameter(
                                          transmissionConfig.tireWidth, 
                                          transmissionConfig.aspectRatio, 
                                          value
                                        )
                                        updateTransmissionConfig(newConfig)
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 text-sm">
                                <span className="font-medium">Tire Size: </span>
                                {transmissionConfig.tireWidth}/{transmissionConfig.aspectRatio}R{transmissionConfig.rimDiameter}
                              </div>
                              <div className="mt-1 text-sm">
                                <span className="font-medium">Tire Diameter: </span>
                                {(transmissionConfig.wheelDiameter * 100).toFixed(1)} cm
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                      <DialogFooter>
                        <Button 
                          onClick={() => {
                            // Apply the current configuration
                            updateTransmissionConfig(transmissionConfig)
                          }}
                        >
                          Apply Configuration
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Configure transmission settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Automotive Data Analyzer v1.3.0</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>
      
      <main className="flex-1 container py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Data Source</CardTitle>
                <CardDescription>Upload or use sample data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FileUpload onFileUpload={handleFileUpload} />
                <Button onClick={loadSampleData} variant="outline" className="w-full">
                  Load Sample Data
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Metrics</span>
                  <div className="flex items-center gap-2">
                    <Select 
                      value={sortOption} 
                      onValueChange={setSortOption}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original Order</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardTitle>
                <CardDescription>Select metrics to display</CardDescription>
                <div className="relative">
                  <Input
                    placeholder="Search metrics..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <MetricSelector
                    metrics={sortedMetrics}
                    selectedMetrics={selectedMetrics}
                    onMetricSelect={handleMetricSelect}
                    getBetterName={getBetterMetricName}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          
          <div className="md:col-span-3 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Time Range</CardTitle>
                <CardDescription>Select data range to analyze</CardDescription>
              </CardHeader>
              <CardContent>
                <Slider
                  defaultValue={[0, 100]}
                  max={100}
                  step={1}
                  value={[timeRange[0], timeRange[1]]}
                  onValueChange={handleTimeRangeChange}
                  className="my-4"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Start: {timeRange[0]}%</span>
                  <span>End: {timeRange[1]}%</span>
                </div>
              </CardContent>
            </Card>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid grid-cols-2 sm:grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="pid" className="hidden sm:block">PID Analysis</TabsTrigger>
                <TabsTrigger value="gps" className="hidden sm:block">GPS Track</TabsTrigger>
                <TabsTrigger value="data" className="hidden sm:block">Data Table</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Key Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedMetrics.slice(0, 3).map((metric) => (
                        <div key={metric} className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">{getBetterMetricName(metric)}</span>
                            <span className="text-sm">
                              {filteredData.length > 0 
                                ? `${filteredData[filteredData.length - 1][metric]?.toFixed(2)} ${getUnitForMetric(metric)}`
                                : '-'
                              }
                            </span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary"
                              style={{ 
                                width: `${filteredData.length > 0 
                                  ? (filteredData[filteredData.length - 1][metric] / Math.max(...filteredData.map(d => d[metric])) * 100)
                                  : 0}%` 
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Gear Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {gearDistributionPercentages.map(({ gear, percentage }) => (
                          <div key={gear} className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">Gear {gear}</span>
                              <span className="text-sm">{percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Speed vs RPM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      {filteredData.length > 0 && (
                        <MetricChart
                          data={filteredData}
                          metrics={['Speed', 'RPM']}
                          hoveredDataPoint={hoveredDataPoint}
                          onDataPointHover={handleDataPointHover}
                          getBetterName={getBetterMetricName}
                          getUnitForMetric={getUnitForMetric}
                          normalizeValues={false}
                          height={300}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="metrics" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {selectedMetrics.map((metric) => (
                    <Card key={metric}>
                      <CardHeader>
                        <CardTitle>{getBetterMetricName(metric)}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[200px]">
                          {filteredData.length > 0 && (
                            <MetricChart
                              data={filteredData}
                              metrics={[metric]}
                              hoveredDataPoint={null}
                              onDataPointHover={() => {}}
                              getBetterName={getBetterMetricName}
                              getUnitForMetric={getUnitForMetric}
                              height={200}
                            />
                          \
