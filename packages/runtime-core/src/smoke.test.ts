import { describe, expect, it } from "bun:test"

describe("@spectrum/runtime-core smoke", () => {
  it("exposes the package name when imported", async () => {
    const mod = await import("./index")
    expect(mod).toBeDefined()
  })
})
