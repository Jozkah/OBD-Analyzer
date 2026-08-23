import { describe, it, expect } from "vitest"
import { mergeCSVFiles } from "./merge-csv"

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: "text/csv" })
}

describe("mergeCSVFiles", () => {
  it("returns the single file unchanged", async () => {
    const f = csvFile("a.csv", "time,rpm\n0,1000\n")
    expect(await mergeCSVFiles([f])).toBe(f)
  })

  it("appends data rows from compatible files in order, keeping one header", async () => {
    const a = csvFile("a.csv", "time,rpm\n0,1000\n1,1100\n")
    const b = csvFile("b.csv", "time,rpm\n0,1200\n1,1300\n")
    const merged = await mergeCSVFiles([a, b])
    const text = await merged.text()
    const lines = text.trim().split("\n")
    expect(lines[0]).toBe("time,rpm")
    // One header + 4 data rows.
    expect(lines).toHaveLength(5)
    expect(lines).toContain("0,1200")
  })

  it("merges cosmetically different but unit-compatible headers", async () => {
    const a = csvFile("a.csv", "Latitude (deg),rpm\n1,1000\n")
    const b = csvFile("b.csv", "Latitude,rpm\n2,1100\n")
    const merged = await mergeCSVFiles([a, b])
    expect((await merged.text()).trim().split("\n")).toHaveLength(3)
  })

  it("refuses to merge conflicting units", async () => {
    const a = csvFile("a.csv", "Speed (km/h)\n50\n")
    const b = csvFile("b.csv", "Speed (mph)\n30\n")
    await expect(mergeCSVFiles([a, b])).rejects.toThrow(/header differs/i)
  })

  it("refuses to merge files with a different column count", async () => {
    const a = csvFile("a.csv", "time,rpm\n0,1000\n")
    const b = csvFile("b.csv", "time,rpm,speed\n0,1000,50\n")
    await expect(mergeCSVFiles([a, b])).rejects.toThrow()
  })
})
