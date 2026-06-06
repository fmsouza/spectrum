import { describe, expect, it } from "bun:test"
import * as primitives from "./index"

describe("primitives barrel", () => {
  it("re-exports Stack, Row and Truncate", () => {
    expect(typeof primitives.Stack).toBe("function")
    expect(typeof primitives.Row).toBe("function")
    expect(typeof primitives.Truncate).toBe("function")
  })
})
