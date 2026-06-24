import { describe, expect, it } from "bun:test"
import { withTimeout } from "./withTimeout"

describe("withTimeout", () => {
  it("resolves with the value when the promise settles before the timeout", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, "load")
    expect(result).toBe(42)
  })

  it("rejects with a labelled error when the promise exceeds the timeout", async () => {
    const never = new Promise<number>(() => {})
    await expect(withTimeout(never, 10, "load")).rejects.toThrow(
      "load timed out",
    )
  })
})
