import { describe, expect, it } from "bun:test"
import { ProviderIdSchema, RunnerIdSchema, SecretRefSchema } from "./ids"

describe("ProviderIdSchema", () => {
  it("parses a non-empty string into a branded ProviderId", () => {
    expect(ProviderIdSchema.parse("p_123")).toBe<string>("p_123")
  })
  it("rejects an empty string", () => {
    expect(ProviderIdSchema.safeParse("").success).toBe(false)
  })
})

describe("SecretRefSchema", () => {
  it("parses an object with a non-empty ref", () => {
    expect(SecretRefSchema.parse({ ref: "kc_abc" })).toEqual({ ref: "kc_abc" })
  })
  it("rejects an object containing a raw secret value field", () => {
    expect(
      SecretRefSchema.safeParse({ ref: "kc_abc", value: "sk-xxx" }).success,
    ).toBe(false)
  })
})

describe("RunnerIdSchema", () => {
  it("parses a non-empty runner id when given a valid string", () => {
    const parsed = RunnerIdSchema.parse("rnr_root")
    expect(parsed).toBe<string>("rnr_root")
  })

  it("rejects an empty string when parsed", () => {
    expect(RunnerIdSchema.safeParse("").success).toBe(false)
  })
})
