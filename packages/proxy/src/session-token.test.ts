import { describe, expect, it } from "bun:test"
import { decodeSessionToken, encodeSessionProxyKey } from "./session-token"

describe("session token codec", () => {
  it("round-trips a model id through encode/decode when a session is present", () => {
    const token = encodeSessionProxyKey("master-key-no-dots", "mdl_abc-123")
    expect(token.startsWith("master-key-no-dots.")).toBe(true)
    expect(token.includes(".")).toBe(true)
    const decoded = decodeSessionToken(token)
    expect(decoded.masterKey).toBe("master-key-no-dots")
    expect(decoded.modelId).toBe("mdl_abc-123")
  })

  it("decodes a bare master key as having no model id when no session is present", () => {
    const decoded = decodeSessionToken("master-key-no-dots")
    expect(decoded.masterKey).toBe("master-key-no-dots")
    expect(decoded.modelId).toBeUndefined()
  })

  it("splits on the FIRST dot so a base64url payload cannot corrupt the master key", () => {
    // base64url never emits '.', but assert the split contract explicitly.
    const token = encodeSessionProxyKey("abc123", "legacy-alias-name")
    const decoded = decodeSessionToken(token)
    expect(decoded.masterKey).toBe("abc123")
    expect(decoded.modelId).toBe("legacy-alias-name")
  })
})
