import { describe, expect, it } from "bun:test"
import * as runStore from "./index"

describe("@spectrum/run-store barrel", () => {
  it("exports createRunStore when imported", () => {
    expect(typeof runStore.createRunStore).toBe("function")
  })
})
