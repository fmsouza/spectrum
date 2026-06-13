import { describe, expect, it } from "bun:test"
import * as api from "./index"

describe("@spectrum/driver-codex barrel", () => {
  it("exports createCodexDriver, mapCodexEvent, CODEX_APP_SERVER_VERSION, and createStdioJsonRpcTransport", () => {
    expect(typeof api.createCodexDriver).toBe("function")
    expect(typeof api.mapCodexEvent).toBe("function")
    expect(api.CODEX_APP_SERVER_VERSION).toBe("0.130.0")
    expect(typeof api.createStdioJsonRpcTransport).toBe("function")
  })
})
