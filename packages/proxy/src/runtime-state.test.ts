import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createFileRuntimeState,
  createInMemoryRuntimeState,
} from "./runtime-state"

describe("createInMemoryRuntimeState", () => {
  it("returns null from readProxyKey when nothing was written", async () => {
    const state = createInMemoryRuntimeState()
    expect(await state.readProxyKey()).toBeNull()
  })

  it("returns the key after writeProxyKey", async () => {
    const state = createInMemoryRuntimeState()
    const result = await state.writeProxyKey("the-key")
    expect(result.ok).toBe(true)
    expect(await state.readProxyKey()).toBe("the-key")
  })

  it("returns null after clear", async () => {
    const state = createInMemoryRuntimeState()
    await state.writeProxyKey("the-key")
    await state.clear()
    expect(await state.readProxyKey()).toBeNull()
  })
})

describe("createFileRuntimeState", () => {
  const tempDir = (): string => mkdtempSync(join(tmpdir(), "lk-runtime-"))

  it("roundtrips write -> read -> clear against the real filesystem", async () => {
    const dir = tempDir()
    const path = join(dir, "runtime.json")
    try {
      const state = createFileRuntimeState(path)
      expect(await state.readProxyKey()).toBeNull()

      const written = await state.writeProxyKey("persisted-key")
      expect(written.ok).toBe(true)
      expect(await state.readProxyKey()).toBe("persisted-key")

      await state.clear()
      expect(await state.readProxyKey()).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns null when the file is malformed", async () => {
    const dir = tempDir()
    const path = join(dir, "runtime.json")
    try {
      await Bun.write(path, "not json {")
      const state = createFileRuntimeState(path)
      expect(await state.readProxyKey()).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns null when the file is missing", async () => {
    const dir = tempDir()
    const path = join(dir, "does-not-exist.json")
    try {
      const state = createFileRuntimeState(path)
      expect(await state.readProxyKey()).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("clear is ENOENT-safe and never throws on a missing file", async () => {
    const dir = tempDir()
    const path = join(dir, "missing.json")
    try {
      const state = createFileRuntimeState(path)
      await state.clear()
      expect(await state.readProxyKey()).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
