export function safeMax(arr: number[]): number {
  return arr.reduce((a, b) => (b > a ? b : a), -Infinity)
}
export function safeMin(arr: number[]): number {
  return arr.reduce((a, b) => (b < a ? b : a), Infinity)
}
