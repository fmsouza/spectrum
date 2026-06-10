import { describe, expect, it } from "bun:test"
import { DRIVER_RUNTIME_PACKAGE } from "./index"

describe("@launchkit/driver-runtime barrel", () => {
  it("exports its package marker", () => {
    expect(DRIVER_RUNTIME_PACKAGE).toBe("@launchkit/driver-runtime")
  })
})
