import { describe, expect, it } from "bun:test"
import { err, ok } from "@spectrum/utils"
import { formatCliError, runCliMain } from "./cli"

describe("formatCliError", () => {
  it("renders unknown-command with the offending command quoted", () => {
    expect(formatCliError({ kind: "unknown-command", command: "bogus" })).toBe(
      'spectrum: unknown command "bogus"',
    )
  })

  it("renders a usage error with its detail", () => {
    expect(formatCliError({ kind: "usage", detail: "missing <harness>" })).toBe(
      "spectrum: missing <harness>",
    )
  })

  it("renders a failed error with its detail", () => {
    expect(formatCliError({ kind: "failed", detail: "spawn refused" })).toBe(
      "spectrum: spawn refused",
    )
  })

  it("emits a single line with no trailing newline (the caller adds it)", () => {
    expect(formatCliError({ kind: "failed", detail: "x" })).not.toContain("\n")
  })
})

describe("runCliMain", () => {
  it("exits 0 when the command succeeds", async () => {
    let code = -1
    await runCliMain(["bun", "cli", "list"], {
      run: async () => ok(undefined),
      exit: (c) => {
        code = c
      },
      errOut: () => {},
    })
    expect(code).toBe(0)
  })

  it("threads the received argv straight through to the runner", async () => {
    let seen: readonly string[] | undefined
    await runCliMain(["list", "harnesses"], {
      run: async (argv) => {
        seen = argv
        return ok(undefined)
      },
      exit: () => {},
      errOut: () => {},
    })
    expect(seen).toEqual(["list", "harnesses"])
  })

  it("exits 1 and writes a human-readable error line when the command fails", async () => {
    let code = -1
    let written = ""
    await runCliMain(["bun", "cli", "bogus"], {
      run: async () => err({ kind: "unknown-command", command: "bogus" }),
      exit: (c) => {
        code = c
      },
      errOut: (line) => {
        written = line
      },
    })
    expect(code).toBe(1)
    expect(written).toBe('spectrum: unknown command "bogus"')
  })
})
