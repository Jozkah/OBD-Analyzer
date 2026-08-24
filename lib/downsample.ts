// Largest-Triangle-Three-Buckets downsampling. Unlike uniform "keep every Nth point"
// decimation, LTTB selects the points that best preserve the visual outline of a driver
// series, so short transient spikes (e.g. an RPM flare or boost blip) survive instead of
// being silently dropped between kept samples. Keeps whole rows, always keeps the first
// and last point, and returns the input unchanged when it's already at/under the budget.
//
// `getX` supplies the x-coordinate used for the triangle-area calculation. Pass the SAME domain
// the chart plots against (elapsed seconds for a time axis) so point selection matches the
// rendered spacing on irregularly-sampled logs. Defaults to the array index for backwards
// compatibility.
export function lttbDownsample<T>(
  points: T[],
  threshold: number,
  getY: (p: T) => number,
  getX: (p: T, i: number) => number = (_p, i) => i,
): T[] {
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
      avgX += getX(points[j], j)
      avgY += getY(points[j])
    }
    avgX /= avgLen
    avgY /= avgLen
    // Pick the point in THIS bucket that forms the largest triangle with a and the next avg.
    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1
    const ax = getX(points[a], a)
    const ay = getY(points[a])
    let maxArea = -1
    let chosen = rangeStart
    for (let j = rangeStart; j < rangeEnd; j++) {
      const cx = getX(points[j], j)
      const area = Math.abs((ax - avgX) * (getY(points[j]) - ay) - (ax - cx) * (avgY - ay))
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
