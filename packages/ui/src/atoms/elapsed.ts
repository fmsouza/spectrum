/**
 * Pure: whole seconds elapsed since `startMs`, or `undefined` until at least
 * `minVisibleSeconds` have passed (so quick turns show no elapsed text).
 */
export const elapsedSecondsFrom = (
  startMs: number,
  nowMs: number,
  minVisibleSeconds: number,
): number | undefined => {
  const seconds = Math.floor((nowMs - startMs) / 1000)
  return seconds >= minVisibleSeconds ? seconds : undefined
}
