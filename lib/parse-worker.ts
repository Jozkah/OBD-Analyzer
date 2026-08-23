// Run the pure CSV parse in a Web Worker so large logs don't block the main thread (#29).
// Falls back to a synchronous in-thread parse if a Worker can't be constructed (SSR, unsupported
// environment, or any runtime failure) so parsing always still works. Extracted from page.tsx.

import type { TransmissionConfig } from "@/types/obd"
import { parseCsvText, type ParseCsvResult } from "@/lib/parse-csv"

export type WorkerParseResult = ParseCsvResult | { status: "error"; message?: string }

export function parseInWorker(
  text: string,
  transmissionConfig: TransmissionConfig,
): Promise<WorkerParseResult> {
  const runSync = (): WorkerParseResult => parseCsvText(text, transmissionConfig)

  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return Promise.resolve(runSync())
  }

  return new Promise<WorkerParseResult>((resolve, reject) => {
    let w: Worker
    try {
      // Path RELATIVE to this file (lib/parse-worker.ts) so webpack bundles the worker (#29).
      w = new Worker(new URL("./parse-csv.worker.ts", import.meta.url))
    } catch {
      resolve(runSync())
      return
    }
    w.onmessage = (e: MessageEvent<WorkerParseResult>) => {
      resolve(e.data)
      w.terminate()
    }
    w.onerror = (err) => {
      w.terminate()
      reject(err)
    }
    w.postMessage({ text, transmissionConfig })
  }).catch(() => runSync())
}
