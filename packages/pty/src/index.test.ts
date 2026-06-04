import { describe, expect, it } from "bun:test"
import * as pty from "./index"

describe("@launchkit/pty barrel", () => {
  it("exports the scrollback store factories and fs adapters", () => {
    for (const name of [
      "createFileScrollbackStore",
      "createMemoryScrollbackStore",
      "createMemoryScrollbackFs",
      "createBunScrollbackFs",
    ]) {
      expect(typeof (pty as Record<string, unknown>)[name]).toBe("function")
    }
  })
})
