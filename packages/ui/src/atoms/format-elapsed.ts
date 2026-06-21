/**
 * Pure: format whole seconds as a compact, whole-unit, drop-trailing string.
 *
 * - `< 60s`        -> "45s"
 * - `60s..3599s`   -> "2m 13s"   (always minutes + seconds; zero seconds shown)
 * - `>= 3600s`     -> "1h 5m 12s" (always hours + minutes + seconds; zero parts shown)
 *
 * Non-finite or negative input collapses to "0s". Callers (the typing indicator)
 * only ever pass whole, non-negative seconds, but the pure function stays
 * deterministic for its own test surface.
 */
export const formatElapsed = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s"
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
