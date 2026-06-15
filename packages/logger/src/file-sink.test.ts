import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { createInMemoryLogFileOps, createRotatingFileSink } from "./file-sink"
import type { LogRecord } from "./types"

const rec = (msg: string): LogRecord => ({
  ts: "2026-06-15T10:00:00.000Z",
  level: "info",
  scope: "t",
  msg,
})

// Build expected paths the SAME way the sink does (node:path join), so the keys
// match on every platform — on Windows `join` yields backslash separators, which
// a hardcoded "/logs/spectrum.log" literal would not.
const dir = join("/", "logs")
const logPath = join(dir, "spectrum.log")
const logPathN = (n: number): string => join(dir, `spectrum.log.${n}`)

describe("createRotatingFileSink", () => {
  it("appends one JSON line per record to dir/spectrum.log", () => {
    const fileOps = createInMemoryLogFileOps()
    const sink = createRotatingFileSink({
      fileOps,
      dir,
      maxBytes: 10_000,
      maxFiles: 3,
    })
    sink.write(rec("a"))
    sink.write(rec("b"))
    const text = fileOps.readForTest(logPath)
    expect(text.trim().split("\n").length).toBe(2)
    expect(text).toContain('"msg":"a"')
    expect(text).toContain('"msg":"b"')
  })

  it("rotates spectrum.log -> .1 when the file exceeds maxBytes", () => {
    const fileOps = createInMemoryLogFileOps()
    const sink = createRotatingFileSink({
      fileOps,
      dir,
      maxBytes: 50,
      maxFiles: 3,
    })
    sink.write(
      rec("first-entry-that-is-long-enough-to-pass-fifty-bytes-easily"),
    )
    // next write sees size >= 50 and rotates before appending
    sink.write(rec("second"))
    expect(fileOps.exists(logPathN(1))).toBe(true)
    expect(fileOps.readForTest(logPath)).toContain('"msg":"second"')
    expect(fileOps.readForTest(logPathN(1))).toContain("first-entry")
  })

  it("prunes to maxFiles, dropping the oldest", () => {
    const fileOps = createInMemoryLogFileOps()
    const sink = createRotatingFileSink({
      fileOps,
      dir,
      maxBytes: 1,
      maxFiles: 2,
    })
    sink.write(rec("one"))
    sink.write(rec("two"))
    sink.write(rec("three"))
    // maxFiles=2 keeps spectrum.log + spectrum.log.1; .2 must not exist
    expect(fileOps.exists(logPathN(2))).toBe(false)
    expect(fileOps.exists(logPathN(1))).toBe(true)
    expect(fileOps.readForTest(logPath)).toContain('"msg":"three"')
  })

  it("never throws when the underlying fileOps throws", () => {
    const sink = createRotatingFileSink({
      fileOps: {
        ensureDir: () => {},
        size: () => 0,
        append: () => {
          throw new Error("disk full")
        },
        rename: () => {},
        remove: () => {},
        exists: () => false,
      },
      dir,
      maxBytes: 10,
      maxFiles: 3,
    })
    expect(() => sink.write(rec("x"))).not.toThrow()
  })
})
