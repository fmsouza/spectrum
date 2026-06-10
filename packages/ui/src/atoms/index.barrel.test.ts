import { describe, expect, it } from "bun:test"
import { DiffLine, TokenCount, ToolIcon } from "./index"

describe("atoms barrel", () => {
  it("re-exports the conversation atoms", () => {
    expect(typeof TokenCount).toBe("function")
    expect(typeof DiffLine).toBe("function")
    expect(typeof ToolIcon).toBe("function")
  })
})
