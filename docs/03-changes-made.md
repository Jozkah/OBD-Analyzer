# OBD Data Analyzer — Changes Made During This Session

> Date: April 2, 2026
> Author: AI Code Review Agent

---

## Changes Implemented

### Feature 1: Multi-CSV Import & Merge

**Problem:** Users whose trips are split across multiple CSV files had to manually merge them before importing.

**Solution:** Added support for selecting/dropping multiple `.csv` files at once. The app automatically determines file order and merges them into a single dataset.

**Files changed:** `app/page.tsx`

**New functions added (module-level, before the component):**

1. **`determineFileOrder(files: File[]): File[]`** (lines ~605–632)
   - Tries to extract sequence numbers from filenames using 4 regex patterns:
     - Trailing digits: `trip001.csv`, `data_2.csv`
     - `part N` pattern: `trip_part1.csv`
     - Parenthetical: `log(3).csv`
     - Separator-delimited: `session-2-data.csv`
   - If all files have extractable numbers → sort by sequence number
   - Fallback: sort by `lastModified` timestamp (if unique)
   - Final fallback: natural alphabetical sort (`localeCompare` with `{ numeric: true }`)

2. **`mergeCSVFiles(orderedFiles: File[]): Promise<File>`** (lines ~635–663)
   - Reads all files as text via `Promise.all`
   - Keeps first file in full (comments + header + data)
   - For subsequent files: skips comment lines (`#` prefix) and header row, appends only data rows
   - Returns a new `File` object named `"N files merged"`

**State changes:**
- Added `importedFileNames: string[]` state to track ordered filenames
- Changed `<input type="file">` to include `multiple` attribute

**Handler changes:**
- `handleDrop` — now collects all `.csv` files from `dataTransfer.files`, orders and merges if multiple
- `handleFileUpload` — now collects all `.csv` files from `input.files`, orders and merges if multiple
- `loadSampleData` — now properly sets `selectedFile` and `importedFileNames`

**UI changes:**
- Drop zone text: `"Drag and drop CSV file(s) here"` → shows `"Drop CSV file(s) here"` on drag over
- Drop zone description: `"Select one or multiple CSV files — multiple files will be merged automatically in order"`
- Button text: `"Choose CSV File(s)"`
- File info display: Shows `"3 files merged (15420 records) - km/h"` with ordered filenames below as `file1.csv → file2.csv → file3.csv`

---

### Feature 2: Ignore Idle Checkbox

**Problem:** When a car is idling (speed = 0), it skews statistics like average speed, average RPM, and other metrics downward.

**Solution:** Added an "Ignore Idle" checkbox that excludes data points where `speed === 0` from all statistical calculations, while keeping idle data visible in charts.

**Files changed:** `app/page.tsx`

**State changes:**
- Added `ignoreIdle: boolean` state (default: `false`)

**Logic changes:**
- `stats` useMemo (line ~1400): Added `statsData` filter:
  ```typescript
  const statsData = ignoreIdle ? data.filter((d) => (d.speed || 0) > 0) : data
  ```
  All subsequent stat calculations (`validRPMs`, `validSpeeds`, `validBoosts`, etc.) now operate on `statsData` instead of `data`
- `stats` dependency array: Added `ignoreIdle` as a dependency

**UI changes:**
- Checkbox placed in the control bar, below the time sliders, separated by a `border-t`:
  ```
  [✓] Ignore Idle  (Excludes speed = 0 from statistics and averages)
  ```
- Uses `onCheckedChange={(checked) => setIgnoreIdle(checked === true)}` to properly handle the `boolean | "indeterminate"` type

**What is NOT affected by Ignore Idle:**
- Charts still render ALL data points (including idle periods)
- GPS track still shows full path
- Time slider range is unchanged
- PID Analysis charts show all data
- Only the "Session Statistics" card values change

---

## Summary of All Line Changes

| Area | Type | Description |
|---|---|---|
| Line ~600 | Addition | `determineFileOrder()` function (~28 lines) |
| Line ~635 | Addition | `mergeCSVFiles()` function (~28 lines) |
| Line ~748 | Addition | `importedFileNames` state |
| Line ~749 | Addition | `ignoreIdle` state |
| Line ~1275 | Change | `loadSampleData` now sets `selectedFile` and `importedFileNames` |
| Line ~1284 | Change | `handleDrop` rewritten for multi-file support |
| Line ~1310 | Change | `handleFileUpload` rewritten for multi-file support |
| Line ~1416 | Addition | `statsData` filter based on `ignoreIdle` |
| Line ~1450 | Change | `stats` dependency array includes `ignoreIdle` |
| Line ~1505 | Change | File input gets `multiple` attribute |
| Line ~1520 | Change | File info display shows merged file info |
| Line ~1673 | Addition | Ignore Idle checkbox in control bar |
| Line ~2601 | Change | Drop zone text updated for multi-file |
| Line ~2607 | Change | Button text updated to "Choose CSV File(s)" |

**Net lines added:** ~105 lines (file grew from 2,946 to 3,051 lines)
