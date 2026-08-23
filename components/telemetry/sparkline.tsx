interface SparklineProps {
  values: number[]
  color: string
  width?: number
  height?: number
  className?: string
}

/**
 * Tiny inline-SVG sparkline. Cheap enough to render one per table row (no Recharts instance).
 * Uniformly samples up to ~40 points and normalises to the box height.
 */
export function Sparkline({ values, color, width = 88, height = 24, className }: SparklineProps) {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v))
  if (clean.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />
  }
  const step = Math.max(1, Math.floor(clean.length / 40))
  const sampled: number[] = []
  for (let i = 0; i < clean.length; i += step) sampled.push(clean[i])
  const min = Math.min(...sampled)
  const max = Math.max(...sampled)
  const span = max - min || 1
  const pad = 2
  const innerH = height - pad * 2
  const points = sampled.map((v, i) => {
    const x = (i / (sampled.length - 1)) * width
    const y = pad + innerH - ((v - min) / span) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
