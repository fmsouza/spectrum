import { describe, expect, it } from "bun:test"
import { isErr, isOk } from "@launchkit/utils"
import { createSqliteClient } from "./client"

describe("createSqliteClient", () => {
  it("returns ok with a usable handle and connection for an in-memory db", () => {
    const r = createSqliteClient(":memory:")
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    expect(r.value.handle).toBeDefined()
    expect(r.value.connection).toBeDefined()
  })

  it("returns err open-failed when the path cannot be opened", () => {
    // A path whose parent directory does not exist cannot be opened.
    const r = createSqliteClient("/nonexistent-dir-xyz/does/not/exist.db")
    expect(isErr(r) && r.error.kind).toBe("open-failed")
  })
})
