import { describe, test, expect } from "vitest"
import { parseNumericValue, isNumericCell, detectCommaMeaning } from "./parse-number"

describe("parseNumericValue", () => {
  test("plain integers and decimals", () => {
    expect(parseNumericValue("0")).toBe(0)
    expect(parseNumericValue("42")).toBe(42)
    expect(parseNumericValue("14.7")).toBe(14.7)
    expect(parseNumericValue("-61.13")).toBe(-61.13)
  })

  test("EU single comma is a decimal separator by default", () => {
    expect(parseNumericValue("12,5")).toBe(12.5)
    expect(parseNumericValue("0,850")).toBe(0.85)
    expect(parseNumericValue("3,500")).toBe(3.5) // ambiguous → EU default
  })

  test("3-decimal dot values are NOT read as thousands", () => {
    expect(parseNumericValue("14.700")).toBe(14.7)
    expect(parseNumericValue("0.850")).toBe(0.85)
  })

  test("both separators: right-most is the decimal", () => {
    expect(parseNumericValue("1,234.5")).toBe(1234.5) // US
    expect(parseNumericValue("1.234,5")).toBe(1234.5) // EU
  })

  test("multiple grouping separators", () => {
    expect(parseNumericValue("1,234,567")).toBe(1234567)
    expect(parseNumericValue("1.234.567")).toBe(1234567)
  })

  test("strips exporter backslashes (escaped GPS decimals)", () => {
    expect(parseNumericValue("01\\.44")).toBe(1.44)
    expect(parseNumericValue("-61\\.13")).toBe(-61.13)
  })

  test("commaMeaning='thousands' fixes US-grouped integers", () => {
    expect(parseNumericValue("3,500", "thousands")).toBe(3500)
    expect(parseNumericValue("1,234", "thousands")).toBe(1234)
    // A 2-digit trailing group is still a decimal even in US mode (not a valid group of 3).
    expect(parseNumericValue("12,5", "thousands")).toBe(12.5)
  })

  test("non-numeric input coerces to 0", () => {
    expect(parseNumericValue("")).toBe(0)
    expect(parseNumericValue("OL")).toBe(0)
  })
})

describe("isNumericCell", () => {
  test("accepts numeric-looking cells", () => {
    expect(isNumericCell("3,500")).toBe(true)
    expect(isNumericCell("-61.13")).toBe(true)
    expect(isNumericCell("01\\.44")).toBe(true)
  })
  test("rejects text/enum cells", () => {
    expect(isNumericCell("OL")).toBe(false)
    expect(isNumericCell("")).toBe(false)
    expect(isNumericCell("  ")).toBe(false)
    expect(isNumericCell("N/A")).toBe(false)
  })
})

describe("detectCommaMeaning", () => {
  test("defaults to EU decimal for a European-format file", () => {
    // Lone commas as decimals, no dot-decimal evidence.
    expect(detectCommaMeaning(["12,5", "0,850", "3,5", "100"])).toBe("decimal")
  })

  test("detects US thousands when the file clearly uses dot decimals", () => {
    // Several dot-decimals + comma-grouped integers, no comma-decimal counter-evidence.
    expect(detectCommaMeaning(["14.7", "0.85", "98.6", "3,500", "1,234"])).toBe("thousands")
  })

  test("EU wins when both a comma-decimal and dot-decimals appear (ambiguous → safe)", () => {
    expect(detectCommaMeaning(["14.7", "0.85", "98.6", "12,5"])).toBe("decimal")
  })

  test("mixed both-separator values pick the file convention", () => {
    expect(detectCommaMeaning(["1,234.5", "9,999.9", "5,000.0", "1,000"])).toBe("thousands")
    expect(detectCommaMeaning(["1.234,5", "9.999,9", "1,000"])).toBe("decimal")
  })

  test("not enough dot-decimal evidence stays EU", () => {
    expect(detectCommaMeaning(["14.7", "3,500"])).toBe("decimal") // only 1 dot-decimal (<3)
  })
})
