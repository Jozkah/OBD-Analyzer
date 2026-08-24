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

  it("compares quoted headers that contain commas as single columns", async () => {
    // Both headers are 2 columns despite the comma inside the quoted first field.
    const a = csvFile("a.csv", '"Speed, mph",rpm\n30,1000\n')
    const b = csvFile("b.csv", '"Speed, mph",rpm\n40,1100\n')
    const merged = await mergeCSVFiles([a, b])
    const lines = (await merged.text()).trim().split("\n")
    expect(lines[0]).toBe('"Speed, mph",rpm')
    expect(lines).toHaveLength(3) // one header + two data rows
  })

  it("rejects a quoted header whose real column count differs (not fooled by commas)", async () => {
    // Naive comma-splitting would read the first as 3 cols and the second as 2 and might mis-handle
    // it; a quote-aware comparison correctly sees 2 vs 3 columns and refuses.
    const a = csvFile("a.csv", '"Speed, mph",rpm\n30,1000\n')
    const b = csvFile("b.csv", "Speed,mph,rpm\n30,1,1000\n")
    await expect(mergeCSVFiles([a, b])).rejects.toThrow(/header differs/i)
  })

  it("concatenates data rows in the given order (sequential timestamps stay ordered)", async () => {
    const a = csvFile("a.csv", "time,rpm\n0,1000\n1,1100\n")
    const b = csvFile("b.csv", "time,rpm\n2,1200\n3,1300\n")
    const merged = await mergeCSVFiles([a, b])
    const lines = (await merged.text()).trim().split("\n")
    expect(lines).toEqual(["time,rpm", "0,1000", "1,1100", "2,1200", "3,1300"])
  })

  it("skips comment/blank lines in appended files but keeps their data", async () => {
    const a = csvFile("a.csv", "time,rpm\n0,1000\n")
    const b = csvFile("b.csv", "# device: obd\ntime,rpm\n\n1,1100\n")
    const merged = await mergeCSVFiles([a, b])
    const lines = (await merged.text()).trim().split("\n")
    expect(lines).toEqual(["time,rpm", "0,1000", "1,1100"])
  })
})
