import { describe, expect, it } from "bun:test"
import * as brand from "./index"

describe("@launchkit/brand barrel", () => {
  it("exports the SpectrumMark component when imported", () => {
    expect(typeof brand.SpectrumMark).toBe("function")
  })
})
