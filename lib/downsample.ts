// Largest-Triangle-Three-Buckets downsampling. Unlike uniform "keep every Nth point"
// decimation, LTTB selects the points that best preserve the visual outline of a driver
// series, so short transient spikes (e.g. an RPM flare or boost blip) survive instead of
// being silently dropped between kept samples. Keeps whole rows, always keeps the first
// and last point, and returns the input unchanged when it's already at/under the budget.
export function lttbDownsample<T>(points: T[], threshold: number, getY: (p: T) => number): T[] {
  const n = points.length
  if (threshold >= n || threshold < 3) return points
  const sampled: T[] = [points[0]]
  const bucketSize = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    // Average point of the NEXT bucket (used to form the triangle).
    const avgStart = Math.floor((i + 1) * bucketSize) + 1
    const avgEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)
    let avgX = 0
    let avgY = 0
    const avgLen = avgEnd - avgStart || 1
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += j
      avgY += getY(points[j])
    }
    avgX /= avgLen
    avgY /= avgLen
    // Pick the point in THIS bucket that forms the largest triangle with a and the next avg.
    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1
    const ay = getY(points[a])
    let maxArea = -1
    let chosen = rangeStart
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((a - avgX) * (getY(points[j]) - ay) - (a - j) * (avgY - ay))
      if (area > maxArea) {
        maxArea = area
        chosen = j
      }
    }
    sampled.push(points[chosen])
    a = chosen
  }
  sampled.push(points[n - 1])
  return sampled
}
