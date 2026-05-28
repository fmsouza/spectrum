import { describe, expect, it } from "bun:test"
import { err, ok } from "@launchkit/utils"
import { runCliMain } from "./cli"

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

  it("exits 1 and writes the error detail when the command fails", async () => {
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
    expect(written).toContain("bogus")
  })
})
