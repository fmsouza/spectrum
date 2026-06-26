import { describe, expect, it } from "bun:test"

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** Walk apps/desktop/src and apps/desktop/views; return every `.ts`/`.tsx` file path. */
const tsFiles = (root: string): string[] => {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        out.push(full)
    }
  }
  walk(root)
  return out
}

const SRC = join(import.meta.dir, ".")
const VIEWS = join(import.meta.dir, "..", "views")

describe("apps/desktop electrobun boundary", () => {
  it("electrobun is only referenced under src/gui/ or views/ (or in test files + type shims)", () => {
    const roots = [SRC, VIEWS]
    const allFiles = roots.flatMap((r) => tsFiles(r))
    const offenders = allFiles
      // Skip test files — the boundary guards production code; tests/comments legitimately mention
      // electrobun (e.g. composition-gui.test.ts).
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      // Skip the type shim files in src/types/ — their content legitimately contains "electrobun"
      // because they declare the module shape (mapped via tsconfig.typecheck.json).
      .filter((f) => !f.includes(`${SRC}/types/`))
      // Skip the GUI composition root — it deliberately lazy-imports `electrobun/bun` to build
      // GUI-only seams (folder picker, URL opener, notifications, watchdog give-up). The lazy
      // import is the established GUI seam pattern; this composition root is GUI-only.
      .filter((f) => !f.endsWith(`${SRC}/composition.ts`))
      .filter((f) => readFileSync(f, "utf8").includes("electrobun"))

    const okPath = (f: string): boolean =>
      f.includes("/gui/") || f.startsWith(join(VIEWS, ""))

    const unexpected = offenders.filter((f) => !okPath(f))
    expect(
      unexpected,
      `electrobun imports must live under src/gui/ or views/: ${unexpected.join(", ")}`,
    ).toEqual([])
  })
})
