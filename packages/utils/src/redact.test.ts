import { describe, expect, it } from "bun:test"
import { redactSecrets } from "./redact"

describe("redactSecrets", () => {
  it("replaces each known secret value with [REDACTED] when present in the text", () => {
    expect(redactSecrets("auth=sk-12345 done", ["sk-12345"])).toBe(
      "auth=[REDACTED] done",
    )
  })
  it("redacts every occurrence of a secret", () => {
    expect(redactSecrets("a sk a sk", ["sk"])).toBe("a [REDACTED] a [REDACTED]")
  })
  it("returns the text unchanged when no secrets are provided", () => {
    expect(redactSecrets("nothing here", [])).toBe("nothing here")
  })
  it("ignores empty-string secrets to avoid redacting everything", () => {
    expect(redactSecrets("keep", [""])).toBe("keep")
  })
})
