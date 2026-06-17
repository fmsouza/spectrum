import type { Platform } from "./platform"

/**
 * Pure helpers for resolving the PATH a GUI-launched process should search.
 *
 * A desktop app launched from Finder/Dock (macOS) or Explorer (Windows) inherits a
 * minimal login PATH that omits user CLI install locations (`~/.local/bin`,
 * `/opt/homebrew/bin`, version-manager shims like nvm/asdf). The composition root
 * uses these helpers — plus a one-shot login-shell probe — to reconstruct the PATH
 * the user actually has in a terminal. Every function here is pure; the spawn effect
 * lives in the desktop app.
 */

/** PATH segment delimiter for the platform (`;` on Windows, `:` elsewhere). */
export const pathDelimiter = (platform: Platform): ";" | ":" =>
  platform === "windows" ? ";" : ":"

/**
 * Merge `additions` ahead of the existing `base` PATH and de-duplicate, keeping the
 * first occurrence of each entry. Additions come first so a user's resolved dirs win
 * over the minimal inherited PATH. Empty segments are dropped.
 */
export const mergePathEntries = (
  base: string | undefined,
  additions: readonly string[],
  platform: Platform,
): string => {
  const delim = pathDelimiter(platform)
  const baseEntries = base === undefined ? [] : base.split(delim)
  const seen = new Set<string>()
  const merged: string[] = []
  for (const entry of [...additions, ...baseEntries]) {
    if (entry === "" || seen.has(entry)) continue
    seen.add(entry)
    merged.push(entry)
  }
  return merged.join(delim)
}

/**
 * Well-known per-OS binary directories used as a static fallback when the login-shell
 * probe is unavailable (no shell, locked-down env). Not exhaustive — the probe covers
 * version-manager shims; this just guarantees the common install spots are searched.
 */
export const commonBinDirs = (input: {
  readonly platform: Platform
  readonly homeDir: string
}): readonly string[] => {
  const { platform, homeDir } = input
  if (platform === "windows") return []
  return [
    `${homeDir}/.local/bin`,
    `${homeDir}/bin`,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/opt/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]
}

/** Sentinels wrapping the printed PATH so it survives an interactive shell's banner. */
export const PATH_SENTINEL_START = "__SPECTRUM_PATH_START__"
export const PATH_SENTINEL_END = "__SPECTRUM_PATH_END__"

/**
 * Build the argv for a login + interactive shell that prints the user's `$PATH`
 * wrapped in sentinels. Interactive (`-i`) is required so shells that initialise
 * version managers in `~/.zshrc`/`~/.bashrc` (nvm, asdf) expose their shims; login
 * (`-l`) picks up `~/.zprofile`/`~/.bash_profile`. The value is `printf`'d (no
 * trailing newline) so parsing is exact.
 */
export const loginShellPathProbe = (
  shell: string,
): { readonly command: string; readonly args: readonly string[] } => ({
  command: shell,
  args: [
    "-ilc",
    // `${PATH}` (braced) is REQUIRED: a bare `$PATH` immediately followed by the
    // sentinel would be parsed as one variable name (sentinel chars are all valid
    // identifier characters), expand to empty, and swallow the closing sentinel.
    `printf '%s' "${PATH_SENTINEL_START}\${PATH}${PATH_SENTINEL_END}"`,
  ],
})

/**
 * Extract the PATH printed by `loginShellPathProbe` from a shell's stdout, ignoring
 * any banner/rc noise outside the sentinels. Returns null when the sentinels are
 * absent or the captured PATH is empty.
 */
export const parseLoginShellPath = (stdout: string): string | null => {
  const start = stdout.indexOf(PATH_SENTINEL_START)
  if (start === -1) return null
  const from = start + PATH_SENTINEL_START.length
  const end = stdout.indexOf(PATH_SENTINEL_END, from)
  if (end === -1) return null
  const value = stdout.slice(from, end)
  return value === "" ? null : value
}
