import { describe, expect, it } from "bun:test"
import { createBunProcessRunner } from "./bun-process-runner"

// `cat` is POSIX; the Windows stdin path is covered by the DPAPI integration test.
const describePosix = process.platform !== "win32" ? describe : describe.skip

describePosix("createBunProcessRunner stdin", () => {
  it("feeds opts.stdin to the child and returns its stdout when piping through cat", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("cat", [], { stdin: "hello-stdin" })
    expect(result).toEqual({ ok: true, value: { stdout: "hello-stdin" } })
  })
})
