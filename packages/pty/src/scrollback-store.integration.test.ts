import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionIdSchema } from "@launchkit/types"
import {
  createBunScrollbackFs,
  createFileScrollbackStore,
} from "./scrollback-store"

const dec = (u: Uint8Array): string => new TextDecoder().decode(u)
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

const tempDirs: string[] = []
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lk-scroll-"))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe("createBunScrollbackFs openAppend — true O_APPEND semantics", () => {
  it("appends to an existing file (not overwrites) when a second writer is opened on the same path", () => {
    const dir = makeTempDir()
    const path = join(dir, "append-test.bin")
    const fs = createBunScrollbackFs()

    // First writer: write "AAA" and close
    const w1Result = fs.openAppend(path)
    expect(w1Result.ok).toBe(true)
    if (!w1Result.ok) return
    expect(w1Result.value.write(enc("AAA")).ok).toBe(true)
    expect(w1Result.value.close().ok).toBe(true)

    // Second writer on the SAME path: write "BBB" and close
    const w2Result = fs.openAppend(path)
    expect(w2Result.ok).toBe(true)
    if (!w2Result.ok) return
    expect(w2Result.value.write(enc("BBB")).ok).toBe(true)
    expect(w2Result.value.close().ok).toBe(true)

    // readWhole must return "AAABBB" — not "BBB" (overwrite) or corrupted bytes
    const readResult = fs.readWhole(path)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(dec(readResult.value)).toBe("AAABBB")
  })
})

describe("createBunScrollbackFs + createFileScrollbackStore (real fs)", () => {
  it("persists appended bytes to disk and reads them back through a fresh store", async () => {
    const dir = makeTempDir()
    const fs = createBunScrollbackFs()
    const store = createFileScrollbackStore({ dir, fs })
    expect(store.append(id, enc("hello ")).ok).toBe(true)
    expect(store.append(id, enc("world")).ok).toBe(true)
    expect(store.close(id).ok).toBe(true)
    // A brand-new store (no in-memory writers) must read the on-disk bytes.
    const reopened = createFileScrollbackStore({
      dir,
      fs: createBunScrollbackFs(),
    })
    const r = reopened.read(id)
    expect(r.ok && dec(r.value)).toBe("hello world")
  })

  it("rotates on real disk at a small cap and read returns the most-recent bytes across rotation", () => {
    const dir = makeTempDir()
    const store = createFileScrollbackStore({
      dir,
      fs: createBunScrollbackFs(),
      capBytes: 8,
    })
    // Drive > capBytes (8): three 4-byte appends => second crosses the cap, rotating.
    store.append(id, enc("AAAA")) // main="AAAA" (4)
    store.append(id, enc("BBBB")) // main="AAAABBBB" (8) -> rotate: .1="AAAABBBB", main=""
    store.append(id, enc("CCCC")) // main="CCCC"
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("AAAABBBBCCCC")
  })
})
