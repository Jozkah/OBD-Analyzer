import type { DataPoint, MetricConfig } from "@/types/obd"

// Parse a single CSV line, respecting double-quoted fields (which may contain
// commas) and stripping any trailing carriage return from CRLF-encoded files.
export function parseCsvLine(line: string): string[] {
  // Defense-in-depth: never read .length off undefined/null (e.g. lines[0] on an
  // empty file). Callers also guard upstream, but this keeps the function safe.
  if (line == null) return []
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      result.push(current)
      current = ""
    } else if (char !== "\r") {
      current += char
    }
  }
  result.push(current)
  return result
}

// Build a CSV of the processed/normalized data for the rows in [lo, hi] (inclusive),
// using each detected metric's original column name as the header plus a leading Time
// column. This exports the merged, unit-normalized data actually being analyzed — useful
// after merging multiple files or trimming to a section — not just the raw upload.
export function buildWindowCsv(data: DataPoint[], metrics: MetricConfig[], lo: number, hi: number): string {
  const escape = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cols = metrics.filter((m) => typeof m.key === "string")
  const header = ["Time", ...cols.map((m) => m.originalName || m.label)]
  const lines = [header.map(escape).join(",")]
  const end = Math.min(hi, data.length - 1)
  for (let i = Math.max(0, lo); i <= end; i++) {
    const point = data[i]
    const row: (string | number)[] = [point?.timestamp ?? ""]
    for (const m of cols) {
      const v = (point as any)?.[m.key as string]
      row.push(typeof v === "number" && !isNaN(v) ? v : "")
    }
    lines.push(row.map(escape).join(","))
  }
  return lines.join("\n")
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Determine the order of multiple CSV files for merging
export function determineFileOrder(files: File[]): File[] {
  if (files.length <= 1) return files

  // Try to extract sequence numbers from filenames
  const withSequence = files.map((file) => {
    const name = file.name.replace(/\.csv$/i, "")
    const match =
      name.match(/(\d+)\s*$/) ||
      name.match(/part\s*(\d+)/i) ||
      name.match(/\((\d+)\)/) ||
      name.match(/[_-](\d+)(?:[_-]|$)/)
    return { file, sequence: match ? parseInt(match[1], 10) : null }
  })

  // If all files have extractable sequence numbers, sort by them
  if (withSequence.every((f) => f.sequence !== null)) {
    return withSequence.sort((a, b) => a.sequence! - b.sequence!).map((f) => f.file)
  }

  // Fallback: sort by lastModified timestamp if they differ
  if (files.every((f) => f.lastModified > 0) && new Set(files.map((f) => f.lastModified)).size === files.length) {
    return [...files].sort((a, b) => a.lastModified - b.lastModified)
  }

  // Final fallback: natural alphabetical sort by name
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}
