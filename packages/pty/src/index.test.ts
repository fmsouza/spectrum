import { describe, expect, it } from "bun:test"

describe("@spectrum/pty package", () => {
  it("exports a defined module namespace", async () => {
    const mod = await import("./index")
    expect(typeof mod).toBe("object")
  })
})
