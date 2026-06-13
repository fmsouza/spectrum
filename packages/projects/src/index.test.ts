import { describe, expect, it } from "bun:test"
import { createProjectStore } from "./index"

describe("@spectrum/projects barrel", () => {
  it("exports the createProjectStore factory", () => {
    expect(typeof createProjectStore).toBe("function")
  })
})
