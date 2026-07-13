export const tooltipFormatter = (value: number | string | undefined): string | number =>
  typeof value === "number" ? Number(value.toFixed(2)) : value ?? ""

// Helper function to format numbers with appropriate decimal places
export function formatValue(value: number, unit = ""): string {
  if (isNaN(value) || value === null || value === undefined) return "N/A"

  // For very small values (less than 0.01), show more precision
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toFixed(4)
  }

  // For percentages and most values, 2 decimal places is enough
  if (unit === "%" || unit === "°C" || unit === "bar" || unit === "V") {
    return value.toFixed(2)
  }

  // For RPM and large numbers, no decimal places
  if (unit === "RPM" || Math.abs(value) > 1000) {
    return value.toFixed(0)
  }

  // Default to 2 decimal places
  return value.toFixed(2)
}
