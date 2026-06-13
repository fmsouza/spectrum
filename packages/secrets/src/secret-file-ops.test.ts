import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFsSecretFileOps,
  createInMemorySecretFileOps,
} from "./secret-file-ops"

describe("createInMemorySecretFileOps", () => {
  it("round-trips write then read and reports not-found after remove", async () => {
    const ops = createInMemorySecretFileOps()
    expect(await ops.exists("/a")).toBe(false)
    expect((await ops.write("/a", "x")).ok).toBe(true)
    expect(await ops.read("/a")).toEqual({ ok: true, value: "x" })
    expect(await ops.exists("/a")).toBe(true)
    expect((await ops.remove("/a")).ok).toBe(true)
    expect(await ops.read("/a")).toEqual({
      ok: false,
      error: { kind: "not-found" },
    })
  })
})

describe("createFsSecretFileOps", () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs.splice(0))
      await rm(d, { recursive: true, force: true })
  })
  const freshPath = () => {
    const dir = join(tmpdir(), `lk-sec-${crypto.randomUUID()}`)
    dirs.push(dir)
    return join(dir, "secrets", "a.enc")
  }

  it("creates parent dirs and round-trips on the windows branch (no chmod) when platform is windows", async () => {
    const ops = createFsSecretFileOps("windows")
    const path = freshPath()
    expect((await ops.write(path, "cipher")).ok).toBe(true)
    expect(await ops.read(path)).toEqual({ ok: true, value: "cipher" })
  })

  it("returns not-found when reading a missing file on the posix branch", async () => {
    const ops = createFsSecretFileOps("linux")
    expect(await ops.read(freshPath())).toEqual({
      ok: false,
      error: { kind: "not-found" },
    })
  })
})
