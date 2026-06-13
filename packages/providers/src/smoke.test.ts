import { describe, expect, it } from "bun:test"
import { PROVIDERS_PACKAGE } from "./index"

describe("@spectrum/providers", () => {
  it("exposes its package name when imported", () => {
    expect(PROVIDERS_PACKAGE).toBe("@spectrum/providers")
  })
})
