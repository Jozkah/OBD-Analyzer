// Numeric parsing helpers for OBD CSV cells. Extracted from app/page.tsx so they can be
// unit-tested in isolation (and to start peeling pure logic out of the big client file).

export type CommaMeaning = "decimal" | "thousands"

// Normalize decimal/grouping separators and parse a number.
//
// A single comma is ambiguous in isolation ("3,500" is 3.5 in the EU and 3500 in the US),
// so the default assumes the EU reading — the historical behavior and the common case for
// this app's audience. Pass commaMeaning="thousands" (decided once per file by
// detectCommaMeaning) to instead treat a lone comma with exactly three trailing digits as
// a thousands separator, fixing the 1000x misread of US-grouped integers like RPM "3,500".
export function parseNumericValue(value: string, commaMeaning: CommaMeaning = "decimal"): number {
  if (!value || typeof value !== "string") return 0

  // Strip stray backslashes first. Some exporters (e.g. datalog.help / OBDLink) escape
  // the decimal separator in GPS columns, writing latitude "01\.44" and longitude
  // "-61\.13". Without this, Number.parseFloat stops at the backslash and truncates the
  // value to its integer part (01\.44 -> 1, -61\.13 -> -61), collapsing every GPS fix
  // onto one coordinate so the track map degenerates to "No track to plot". No legitimate
  // numeric value contains a backslash, so removing them is safe for every column.
  let s = value.trim().replace(/\\/g, "")
  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  if (hasComma && hasDot) {
    // Both separators present: the right-most one is the decimal point, the other is grouping.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".") // EU: 1.234,5 -> 1234.5
    } else {
      s = s.replace(/,/g, "") // US: 1,234.5 -> 1234.5
    }
  } else if (hasComma) {
    const parts = s.split(",")
    // Multiple commas are unambiguous grouping (1,234,567).
    if (parts.length > 2) {
      s = s.replace(/,/g, "")
    } else if (commaMeaning === "thousands" && (parts[1]?.length ?? 0) === 3) {
      // File detected as US-format: a lone comma before exactly three digits is a
      // thousands separator (3,500 -> 3500), not an EU decimal.
      s = s.replace(/,/g, "")
    } else {
      // A single comma is an EU-style decimal separator (12,5 -> 12.5; 0,850 -> 0.85).
      s = s.replace(",", ".")
    }
  } else if (hasDot) {
    const parts = s.split(".")
    // Only MULTIPLE dots are unambiguous grouping (1.234.567). A single dot is a
    // decimal point — including the very common 3-decimal sensor values like
    // 14.700 or 0.850, which must NOT be read as thousands (that was a 1000x bug).
    if (parts.length > 2) {
      s = s.replace(/\./g, "")
    }
  }

  const parsed = Number.parseFloat(s)
  return isNaN(parsed) ? 0 : parsed
}

// True only when a raw cell is genuinely numeric. parseNumericValue can't be used to
// decide this because it always coerces non-numeric input to 0 (never NaN), so a check
// like `!isNaN(parseNumericValue(v))` is always true and would classify text/enum
// columns ("OL"/"CL" fuel-system status, oxygen-sensor location, OBD cert strings) as
// numeric — polluting the PID list with flat-zero traces. This requires at least one
// digit and only digits, sign, separators or the exporter's stray backslash.
export function isNumericCell(value: string): boolean {
  const s = value.replace(/\\/g, "").trim()
  if (!s) return false
  return /^[-+]?[\d.,]+$/.test(s) && /\d/.test(s)
}

// Decide, for a whole file, whether a lone comma means a decimal point (EU) or a thousands
// separator (US). The default is "decimal" (EU) — the historical behavior and the common
// case here — and this only returns "thousands" when the file shows clear dot-as-decimal
// evidence with no comma-as-decimal counter-evidence, so European logs never regress.
export function detectCommaMeaning(cells: string[]): CommaMeaning {
  let dotDecimal = 0 // values using '.' as the decimal point (14.7, 0.85)
  let commaDecimal = 0 // values where a lone comma is clearly a decimal (12,5 / 0,850)
  let euGrouping = 0 // '.'-grouped values (1.234.567) — implies comma is the decimal mark
  let usCandidates = 0 // lone comma + exactly 3 trailing digits, or multi-comma grouping

  for (const raw of cells) {
    const s = raw.replace(/\\/g, "").trim()
    if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) continue
    const hasComma = s.includes(",")
    const hasDot = s.includes(".")

    if (hasComma && hasDot) {
      if (s.lastIndexOf(".") > s.lastIndexOf(",")) dotDecimal++ // 1,234.5 (US)
      else commaDecimal++ // 1.234,5 (EU)
    } else if (hasComma) {
      const parts = s.split(",")
      if (parts.length > 2) {
        usCandidates++ // 1,234,567 → grouping
      } else if ((parts[1]?.length ?? 0) === 3 && !/^[-+]?0$/.test(parts[0])) {
        usCandidates++ // 3,500 / 1,234 → could be thousands (integer part isn't a bare 0)
      } else {
        commaDecimal++ // 12,5 / 0,850 → decimal
      }
    } else if (hasDot) {
      const parts = s.split(".")
      if (parts.length > 2) euGrouping++ // 1.234.567 → EU thousands grouping
      else if ((parts[1]?.length ?? 0) !== 3) dotDecimal++ // 14.7 / 0.85 → dot decimal
      // exactly-3-dp values (14.700) are ambiguous with EU grouping → ignored
    }
  }

  const clearlyDotDecimal = dotDecimal >= 3 && commaDecimal === 0 && euGrouping === 0
  return clearlyDotDecimal && usCandidates > 0 ? "thousands" : "decimal"
}
