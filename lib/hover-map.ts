// Maps a Recharts hover event back to the ORIGINAL log row. The chart plots a sliced (analysis
// window) and downsampled (LTTB) series against elapsed seconds, so neither the array position nor
// the x value equals the original row index. Every retained point instead carries an explicit
// `originalIndex` (its row in the full log); this resolver reads THAT — never the x value — so a
// hover on a downsampled point still selects the correct raw sample.
//
// Recharts version note: recharts@3 changed the `onMouseMove` payload — it no longer includes
// `activePayload`, and it reports the active index as a STRING (`TooltipIndex = string | null`), not
// a number. The previous `typeof idx === "number"` guard therefore silently rejected every v3 hover,
// leaving the synchronized inspector stuck on the playback cursor. This resolver coerces a string
// index and still accepts the v2 shape, so the same code works across both.
export interface HoverPoint {
  originalIndex?: number
  time?: number
}

export function resolveHoverIndex(
  activePayload: Array<{ payload?: HoverPoint }> | undefined,
  activeTooltipIndex: number | string | null | undefined,
  chartData: HoverPoint[],
): number | null {
  // Prefer an explicit payload point (recharts@2). Otherwise index the chart data by the active
  // tooltip index, coercing the recharts@3 string form ("5") to a number.
  let point = activePayload?.[0]?.payload
  if (!point && activeTooltipIndex != null && activeTooltipIndex !== "") {
    const i = typeof activeTooltipIndex === "number" ? activeTooltipIndex : Number(activeTooltipIndex)
    if (Number.isInteger(i) && i >= 0 && i < chartData.length) point = chartData[i]
  }
  const idx = point?.originalIndex ?? point?.time
  return typeof idx === "number" ? idx : null
}
