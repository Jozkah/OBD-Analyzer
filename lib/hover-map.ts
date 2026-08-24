// Maps a Recharts hover event back to the ORIGINAL log row. The chart plots a sliced (analysis
// window) and downsampled (LTTB) series against elapsed seconds, so neither the array position nor
// the x value equals the original row index. Every retained point instead carries an explicit
// `originalIndex` (its row in the full log); this resolver reads THAT — never the x value — so a
// hover on a downsampled point still selects the correct raw sample.
export interface HoverPoint {
  originalIndex?: number
  time?: number
}

/**
 * Resolve the original-row index for a Recharts hover.
 *  - Prefer the active payload's point (Recharts v3 populates `activePayload`).
 *  - Fall back to indexing the chart data by `activeTooltipIndex`.
 *  - Read `originalIndex` (preserved through slicing + downsampling), then `time` (also the original
 *    index) as a safety net. Returns null when nothing resolves.
 */
export function resolveHoverIndex(
  activePayload: Array<{ payload?: HoverPoint }> | undefined,
  activeTooltipIndex: number | undefined,
  chartData: HoverPoint[],
): number | null {
  const p =
    activePayload?.[0]?.payload ??
    (typeof activeTooltipIndex === "number" ? chartData[activeTooltipIndex] : undefined)
  const idx = p?.originalIndex ?? p?.time
  return typeof idx === "number" ? idx : null
}
