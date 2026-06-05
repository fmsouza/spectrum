import { describe, expect, it } from "bun:test"

describe("@launchkit/db", () => {
  it("loads the package barrel without error when imported", async () => {
    const mod = await import("./index")
    expect(mod).toBeDefined()
  })
})
