import { describe, expect, it } from "bun:test"
import * as api from "./index"

describe("@launchkit/driver-codex barrel", () => {
  it("exports CODEX_APP_SERVER_VERSION", () => {
    expect(api.CODEX_APP_SERVER_VERSION).toBe("0.130.0")
  })
})
