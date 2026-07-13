import { parseCsvText } from "./parse-csv"
import type { TransmissionConfig } from "@/types/obd"

// Web Worker entry (#29): runs the pure CSV parse off the main thread so large logs
// don't freeze the UI. The caller posts { text, transmissionConfig }; we post back the
// ParseCsvResult, or { status: "error", message } if the parse throws.
self.onmessage = (e: MessageEvent<{ text: string; transmissionConfig: TransmissionConfig }>) => {
  try {
    ;(self as unknown as Worker).postMessage(parseCsvText(e.data.text, e.data.transmissionConfig))
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ status: "error", message: String(err) })
  }
}
