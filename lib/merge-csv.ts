// Merge multiple CSV files into a single file, preserving the header from the first file.
// Extracted verbatim from app/page.tsx so the import workflow can be tested and reused.

// Two logs of the SAME channels in the SAME order can still carry cosmetically different header
// labels — compare each column by its unit-stripped name so those merge cleanly, while refusing
// genuinely different or re-ordered layouts (and unit conflicts like km/h vs mph).
export async function mergeCSVFiles(orderedFiles: File[]): Promise<File> {
  if (orderedFiles.length === 1) return orderedFiles[0]

  const texts = await Promise.all(orderedFiles.map((f) => f.text()))

  const extractHeader = (text: string): { header: string; dataStart: number; lines: string[] } => {
    const lines = text.split(/\r?\n/)
    for (let j = 0; j < lines.length; j++) {
      const trimmed = lines[j].trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      return { header: trimmed, dataStart: j + 1, lines }
    }
    return { header: "", dataStart: lines.length, lines }
  }

  const base = extractHeader(texts[0])

  const cellName = (cell: string): string =>
    cell.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
  const cellUnit = (cell: string): string => {
    const m = cell.match(/\(([^)]*)\)\s*$/)
    return m ? m[1].replace(/\s+/g, "").toLowerCase() : ""
  }

  const headersCompatible = (a: string, b: string): boolean => {
    const ca = a.split(",")
    const cb = b.split(",")
    if (ca.length !== cb.length) return false
    for (let k = 0; k < ca.length; k++) {
      if (cellName(ca[k]) !== cellName(cb[k])) return false
      const ua = cellUnit(ca[k])
      const ub = cellUnit(cb[k])
      if (ua && ub && ua !== ub) return false
    }
    return true
  }

  // First file: keep everything (comments + header + data)
  let merged = texts[0].trimEnd()

  for (let i = 1; i < texts.length; i++) {
    const cur = extractHeader(texts[i])
    if (!cur.header) continue
    if (!headersCompatible(base.header, cur.header)) {
      throw new Error(
        `Cannot merge "${orderedFiles[i].name}": its CSV header differs from "${orderedFiles[0].name}". ` +
          `Files must log the same PIDs in the same order to be merged.`,
      )
    }
    const dataLines = cur.lines.slice(cur.dataStart).filter((l) => l.trim() && !l.trim().startsWith("#"))
    if (dataLines.length > 0) {
      merged += "\n" + dataLines.join("\n")
    }
  }

  const blob = new Blob([merged], { type: "text/csv" })
  const mergedName = `${orderedFiles.length} files merged`
  return new File([blob], mergedName, { type: "text/csv" })
}
