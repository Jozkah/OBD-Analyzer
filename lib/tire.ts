export function calculateTireDiameter(width: number, aspectRatio: number, rimSize: number): number {
  // Calculate sidewall height: (width * aspect ratio) / 100
  const sidewallHeight = (width * aspectRatio) / 100

  // Convert rim size from inches to mm
  const rimDiameterMm = rimSize * 25.4

  // Total diameter = rim diameter + (2 * sidewall height)
  const totalDiameter = rimDiameterMm + 2 * sidewallHeight

  return Math.round(totalDiameter)
}

export function parseTireSize(tireSize: string): { width: number; aspectRatio: number; rimSize: number } | null {
  // Match patterns like "235/35R19", "235 35 R19", "235-35-19", etc.
  // Anchor the rim with \b so a typo like "235/35R199" is REJECTED rather than
  // silently truncated to rim 19 (which would feed a wrong diameter into the
  // transmission/speed calibration with no user feedback).
  const match = tireSize.match(/(\d{2,3})\s*[/\-\s]\s*(\d{2,3})\s*[rR]?\s*(\d{2})\b/)
  if (!match) return null

  const width = Number.parseInt(match[1])
  const aspectRatio = Number.parseInt(match[2])
  const rimSize = Number.parseInt(match[3])

  // Reject implausible values rather than feeding a wrong diameter into the calibration.
  if (width < 125 || width > 355) return null
  if (aspectRatio < 25 || aspectRatio > 85) return null
  if (rimSize < 12 || rimSize > 24) return null

  return { width, aspectRatio, rimSize }
}
