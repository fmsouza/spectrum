import { describe, expect, it } from "bun:test"
import { Glob } from "bun"

const dir = new URL("./", import.meta.url)

// Legacy token names that must be fully migrated to --lk-*.
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
// (a trailing [\w-] would mean a longer token like --lk-..., so we negate it).
const usesLegacy = (css: string, name: string): boolean =>
  new RegExp(`var\\(\\s*${name}(?![\\w-])`).test(css)

describe("partials reference only --lk-* tokens", () => {
  it("contains no legacy var(--…) references in any partial except tokens.css", async () => {
    const glob = new Glob("*.css")
    const offenders: string[] = []
    for await (const file of glob.scan({ cwd: dir.pathname })) {
      if (file === "tokens.css" || file === "fonts.css") continue
      const css = await Bun.file(new URL(file, dir)).text()
      for (const name of LEGACY)
        if (usesLegacy(css, name)) offenders.push(`${file}: ${name}`)
    }
    expect(offenders).toEqual([])
  })
})
