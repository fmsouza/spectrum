import { describe, expect, it } from "bun:test"

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dir, ".")

/** Walk the package's src tree and return every `.ts` file path. Skips `node_modules` and dotfiles. */
const tsFiles = (): string[] => {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".ts")) out.push(full)
    }
  }
  walk(SRC)
  return out
}

describe("spectrum-cli boundary", () => {
  it("no source file imports electrobun", () => {
    const offenders = tsFiles()
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("electrobun"))
    expect(
      offenders,
      `spectrum-cli must not import electrobun: ${offenders.join(", ")}`,
    ).toEqual([])
  })
})
