import { describe, expect, it } from "bun:test"
import * as platform from "./index"

describe("@launchkit/platform barrel", () => {
  it("exports a module object when imported", () => {
    expect(typeof platform).toBe("object")
  })
})
