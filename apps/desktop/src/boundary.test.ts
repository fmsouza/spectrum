import { describe, expect, it } from "bun:test"

import { readFileSync, readdirSync } from "node:fs"
import * as path from "node:path"

/** Walk apps/desktop/src and apps/desktop/views; return every `.ts`/`.tsx` file path. */
const tsFiles = (root: string): string[] => {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        out.push(full)
    }
  }
  walk(root)
  return out
}

const SRC = path.join(import.meta.dir, ".")
const VIEWS = path.join(import.meta.dir, "..", "views")

/**
 * Normalize a path to forward-slash form. node:fs returns backslash-separated
 * paths on Windows (e.g. `apps\desktop\src\gui\tray.ts`), so every substring /
 * endsWith check below must operate on a single separator form. Without this,
 * the boundary test passes on macOS/Linux and fails on Windows because
 * `f.includes("/gui/")` is FALSE for `apps\desktop\src\gui\tray.ts`.
 *
 * Replaces BOTH separators: on darwin `path.sep` is `/` so a single split is
 * a no-op for backslashes; on win32 `path.sep` is `\` so a single split misses
 * the forward slashes (rare but possible in mixed paths). Replacing both
 * guarantees the same posix form regardless of host.
 */
const toPosix = (f: string): string => f.replace(/\\/g, "/")

/** Is `f` a path we accept as legitimately containing `electrobun`? */
const okPath = (f: string): boolean => {
  const p = toPosix(f)
  return (
    p.includes("/gui/") ||
    p.startsWith(`${toPosix(VIEWS)}/`) ||
    p === toPosix(VIEWS)
  )
}

/** Is `f` the type-shim directory? (content legitimately contains "electrobun") */
const isTypesDir = (f: string): boolean =>
  toPosix(f).startsWith(`${toPosix(SRC)}/types/`)
/** Is `f` the GUI composition root? (legitimately lazy-imports `electrobun/bun`) */
const isCompositionRoot = (f: string): boolean =>
  toPosix(f) === `${toPosix(SRC)}/composition.ts`

/** Build the offender list from an arbitrary set of file paths + contents. */
const findOffenders = (
  files: readonly { path: string; content: string }[],
): string[] =>
  files
    .filter(
      (f) => !f.path.endsWith(".test.ts") && !f.path.endsWith(".test.tsx"),
    )
    .filter((f) => !isTypesDir(f.path))
    .filter((f) => !isCompositionRoot(f.path))
    .filter((f) => f.content.includes("electrobun"))
    .map((f) => f.path)

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
      .filter((f) => !isTypesDir(f))
      // Skip the GUI composition root — it deliberately lazy-imports `electrobun/bun` to build
      // GUI-only seams (folder picker, URL opener, notifications, watchdog give-up). The lazy
      // import is the established GUI seam pattern; this composition root is GUI-only.
      .filter((f) => !isCompositionRoot(f))
      .filter((f) => readFileSync(f, "utf8").includes("electrobun"))

    const unexpected = offenders.filter((f) => !okPath(f))
    expect(
      unexpected,
      `electrobun imports must live under src/gui/ or views/: ${unexpected.join(", ")}`,
    ).toEqual([])
  })

  // Regression: on Windows, node:fs returns backslash-separated paths (e.g.
  // `apps\desktop\src\gui\tray.ts`). The original test used hard-coded forward-
  // slash substring matches (`f.includes("/gui/")`, `f.includes(\`${SRC}/types/\`)`,
  // `f.endsWith(\`${SRC}/composition.ts\`)`), all of which return FALSE for
  // backslash paths on Windows — so GUI files, the type shims, and the
  // composition root were each incorrectly flagged as unexpected offenders and
  // the test failed on Windows CI.
  //
  // We pin the contract on darwin by exercising the path-normalization helpers
  // directly with synthetic Windows-style paths (built via `path.win32.join`)
  // whose suffixes match the real SRC / VIEWS directory suffixes — so `isTypesDir`
  // and `isCompositionRoot` correctly identify exemptions regardless of the
  // host separator.
  it("normalizes paths so Windows-style backslash input works (regression for PR #83 CI failure)", () => {
    const win = path.win32
    // Build a synthetic Windows tree rooted at the same suffix the real SRC /
    // VIEWS have. On Windows CI the real SRC ends in `/<repo>/apps/desktop/src`
    // after `toPosix`; we replicate that prefix so the substring/endsWith checks
    // match.
    const winRoot = toPosix(SRC).replace(/\/apps\/desktop\/src$/, "")
    const winSrc = `${winRoot}/apps/desktop/src`
    const winViews = `${winRoot}/apps/desktop/views`

    const backslashGuiFile = win.join(winSrc, "gui", "tray.ts")
    const backslashTypesShim = win.join(winSrc, "types", "electrobun.d.ts")
    const backslashComposition = win.join(winSrc, "composition.ts")
    const backslashOffender = win.join(winSrc, "main.ts")
    const backslashViewFile = win.join(winViews, "index.tsx")

    // okPath must accept GUI files and view files regardless of separator form.
    expect(okPath(backslashGuiFile)).toBe(true)
    expect(okPath(backslashViewFile)).toBe(true)

    // isTypesDir / isCompositionRoot must accept backslash paths.
    expect(isTypesDir(backslashTypesShim)).toBe(true)
    expect(isCompositionRoot(backslashComposition)).toBe(true)

    // And still reject an actual offender.
    expect(okPath(backslashOffender)).toBe(false)
    expect(isTypesDir(backslashOffender)).toBe(false)
    expect(isCompositionRoot(backslashOffender)).toBe(false)

    // findOffenders must skip the type shim and composition root in backslash form,
    // while flagging a real offender.
    const fixture: { path: string; content: string }[] = [
      { path: backslashGuiFile, content: 'import "electrobun/bun"' },
      { path: backslashTypesShim, content: 'declare module "electrobun"' },
      {
        path: backslashComposition,
        content: 'const x = import("electrobun/bun")',
      },
      { path: backslashOffender, content: 'import "electrobun/bun"' },
    ]
    const offenders = findOffenders(fixture)
    expect(offenders).toContain(backslashOffender)
    expect(offenders).not.toContain(backslashTypesShim)
    expect(offenders).not.toContain(backslashComposition)
  })
})
