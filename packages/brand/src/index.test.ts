import { describe, expect, it } from "bun:test"
import * as brand from "./index"

describe("@launchkit/brand barrel", () => {
  it("exports the LaunchKitMark component when imported", () => {
    expect(typeof brand.LaunchKitMark).toBe("function")
  })
})
