import type { TransmissionConfig } from "@/types/obd"

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

export function importTransmissionConfig(
  file: File,
  callback: (config: TransmissionConfig) => void,
  onError: (message: string) => void,
): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target?.result as string)
      if (config.gearRatios && config.finalDrive && config.tyreDiameterMm) {
        callback(config)
      } else {
        onError("That file isn't a valid transmission configuration.")
      }
    } catch (error) {
      onError("Couldn't read that transmission configuration file.")
    }
  }
  reader.onerror = () => onError("Couldn't read that transmission configuration file.")
  reader.readAsText(file)
}
