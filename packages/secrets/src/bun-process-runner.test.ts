import { describe, expect, it } from "bun:test"
import { createBunProcessRunner } from "./bun-process-runner"

describe("createBunProcessRunner", () => {
  it("returns an Ok carrying captured stdout when the command exits zero", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("printf", ["hello"])
    expect(result).toEqual({ ok: true, value: { stdout: "hello" } })
  })

  it("returns a backend-failed error when the command exits non-zero", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("false", [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("backend-failed")
  })

  it("returns a backend-failed error when the command cannot be spawned", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("spectrum-no-such-binary-xyz", [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("backend-failed")
  })
})
