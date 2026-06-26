import { describe, expect, it } from "bun:test"

describe("spectrum-cli smoke", () => {
  it("imports the app barrel", async () => {
    const mod = await import("./index")
    expect(mod).toBeDefined()
  })
})
