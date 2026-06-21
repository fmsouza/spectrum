/** The maximum length of a derived session name. */
export const SESSION_NAME_MAX = 80

/**
 * Derive a single-line session name from arbitrary prompt text.
 * Trims, collapses ALL whitespace (including newlines) to single spaces, and
 * truncates at SESSION_NAME_MAX characters. Returns "" for blank/whitespace-only
 * input — the caller MUST skip naming in that case (never write name:"").
 * Pure and deterministic.
 */
export const deriveSessionName = (text: string): string => {
  const collapsed = text.replace(/\s+/g, " ").trim()
  if (collapsed === "") return ""
  return collapsed.slice(0, SESSION_NAME_MAX)
}
