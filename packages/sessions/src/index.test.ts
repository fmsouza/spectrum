import { describe, expect, it } from "bun:test"
import * as sessions from "./index"

describe("@launchkit/sessions barrel", () => {
  it("exports createSessionStore when imported", () => {
    expect(typeof sessions.createSessionStore).toBe("function")
  })

  it("no longer exports the removed bun:sqlite/in-memory adapters", () => {
    expect("createInMemoryDatabase" in sessions).toBe(false)
    expect("createBunSqliteDatabase" in sessions).toBe(false)
  })
})
