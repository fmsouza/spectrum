import { describe, expect, it } from "bun:test"
import { createMemoryScrollbackFs } from "./scrollback-store"

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const dec = (u: Uint8Array): string => new TextDecoder().decode(u)

describe("createMemoryScrollbackFs", () => {
  it("appends bytes through an open writer and reads them back when the file is read whole", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.value.write(enc("ab")).ok).toBe(true)
    expect(w.value.write(enc("cd")).ok).toBe(true)
    expect(w.value.close().ok).toBe(true)
    const r = fs.readWhole("/d/a.bin")
    expect(r.ok && dec(r.value)).toBe("abcd")
  })

  it("reports existence and removes a file when unlink is called", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    if (!w.ok) return
    w.value.write(enc("x"))
    w.value.close()
    expect(fs.exists("/d/a.bin")).toBe(true)
    expect(fs.unlink("/d/a.bin").ok).toBe(true)
    expect(fs.exists("/d/a.bin")).toBe(false)
  })

  it("renames a file so the old path is gone and the new path holds the bytes", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    if (!w.ok) return
    w.value.write(enc("keep"))
    w.value.close()
    expect(fs.rename("/d/a.bin", "/d/a.1.bin").ok).toBe(true)
    expect(fs.exists("/d/a.bin")).toBe(false)
    const r = fs.readWhole("/d/a.1.bin")
    expect(r.ok && dec(r.value)).toBe("keep")
  })

  it("returns a scrollback-io error when reading a path that does not exist", () => {
    const fs = createMemoryScrollbackFs()
    const r = fs.readWhole("/d/missing.bin")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })
})
