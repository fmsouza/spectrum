import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { createFileScrollbackStore, createMemoryScrollbackFs } from "./scrollback-store"

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const dec = (u: Uint8Array): string => new TextDecoder().decode(u)

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

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

describe("createFileScrollbackStore", () => {
  it("appends chunks for a session and reads them back concatenated", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    expect(store.append(id, enc("foo")).ok).toBe(true)
    expect(store.append(id, enc("bar")).ok).toBe(true)
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("foobar")
  })

  it("writes to <dir>/<id>.bin", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    store.append(id, enc("hi"))
    expect(fs.exists("/scroll/s_00000000-0000-4000-8000-000000000000.bin")).toBe(true)
  })

  it("returns an empty buffer when reading a session that has no data yet", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const r = store.read(id)
    expect(r.ok && r.value.length).toBe(0)
  })

  it("rejects an id containing a path separator with a scrollback-io error", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const bad = "../escape" as unknown as typeof id
    const r = store.append(bad, enc("x"))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })

  it("rejects a read for an id with a backslash without touching the fs", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const bad = "a\\b" as unknown as typeof id
    const r = store.read(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })

  it("rotates at the byte cap and read returns the most-recent bytes across the rotation", () => {
    const fs = createMemoryScrollbackFs()
    // capBytes = 4: each 2-byte append fills the cap after two writes, forcing a rotation.
    const store = createFileScrollbackStore({ dir: "/scroll", fs, capBytes: 4 })
    store.append(id, enc("AA")) // main = "AA"           (2 bytes)
    store.append(id, enc("BB")) // main = "AABB" -> hits cap -> rotate: .1.bin="AABB", main=""
    store.append(id, enc("CC")) // main = "CC"
    const r = store.read(id)
    // read = concat(.1.bin, main) = "AABB" + "CC"
    expect(r.ok && dec(r.value)).toBe("AABBCC")
    expect(fs.exists("/scroll/s_00000000-0000-4000-8000-000000000000.1.bin")).toBe(true)
  })

  it("keeps only one rotation generation, replacing a prior .1.bin on the next rotation", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs, capBytes: 4 })
    store.append(id, enc("AABB")) // hits cap -> rotate gen1: .1.bin="AABB", main=""
    store.append(id, enc("CCDD")) // hits cap -> rotate gen2: .1.bin="CCDD" (replaces), main=""
    store.append(id, enc("EE"))
    const r = store.read(id)
    // The first generation ("AABB") is gone; only the latest rotated file + current remain.
    expect(r.ok && dec(r.value)).toBe("CCDDEE")
  })
})
