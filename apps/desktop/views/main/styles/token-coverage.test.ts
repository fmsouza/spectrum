import { describe, expect, it } from "bun:test"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const dir = new URL("./", import.meta.url)

// Legacy token names that must be fully migrated to --sp-*.
const LEGACY = [
  "--bg",
  "--bg-grain",
  "--surface",
  "--surface-2",
  "--surface-inset",
  "--border",
  "--border-strong",
  "--text",
  "--text-muted",
  "--text-faint",
  "--accent",
  "--accent-strong",
  "--accent-soft",
  "--accent-contrast",
  "--green",
  "--red",
  "--blue",
  "--amber",
  "--grey",
  "--sidebar-bg",
  "--sidebar-fg",
  "--sidebar-fg-dim",
  "--sidebar-active-fg",
  "--font-sans",
  "--font-mono",
  "--ease",
  "--dur",
  "--ring",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
  "--radius-xs",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-pill",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-7",
  "--space-8",
  "--rail-w",
  "--master-w",
  "--sidebar-w",
  "--text-xs",
  "--text-sm",
  "--text-base",
  "--text-lg",
  "--text-xl",
  "--text-2xl",
]

// True if css references var(--name) where --name is the EXACT legacy token
// (a trailing [\w-] would mean a longer token like --sp-..., so we negate it).
const usesLegacy = (css: string, name: string): boolean =>
  new RegExp(`var\\(\\s*${name}(?![\\w-])`).test(css)

describe("partials reference only --sp-* tokens", () => {
  it("contains no legacy var(--…) references in any partial except tokens.css", async () => {
    // Discover the partials via the resolved filesystem path (fileURLToPath handles
    // the Windows `/D:/…` URL form that breaks Glob's `cwd`); read each via a file URL
    // so reads stay cross-platform.
    const cssFiles = readdirSync(fileURLToPath(dir)).filter((f) =>
      f.endsWith(".css"),
    )
    const offenders: string[] = []
    for (const file of cssFiles) {
      if (file === "tokens.css" || file === "fonts.css") continue
      const css = await Bun.file(new URL(file, dir)).text()
      for (const name of LEGACY)
        if (usesLegacy(css, name)) offenders.push(`${file}: ${name}`)
    }
    expect(cssFiles.length).toBeGreaterThan(0) // guard against an empty scan passing vacuously
    expect(offenders).toEqual([])
  })
})
