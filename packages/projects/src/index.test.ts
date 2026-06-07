import { describe, expect, it } from "bun:test"
import { createProjectStore } from "./index"

describe("@launchkit/projects barrel", () => {
  it("exports the createProjectStore factory", () => {
    expect(typeof createProjectStore).toBe("function")
  })
})
