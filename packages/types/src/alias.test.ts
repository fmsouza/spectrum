import { describe, expect, it } from "bun:test"
import { ModelAliasSchema } from "./alias"

describe("ModelAliasSchema", () => {
  it("parses a valid alias mapping", () => {
    const a = {
      alias: "fast" as const,
      providerId: "p_openai" as const,
      providerModel: "gpt-4o-mini",
    }
    const parsed = ModelAliasSchema.parse(a)
    expect(parsed.alias).toBe("fast")
    expect(parsed.providerId).toBe("p_openai")
    expect(parsed.providerModel).toBe("gpt-4o-mini")
  })
  it("rejects an alias with an empty providerModel", () => {
    expect(
      ModelAliasSchema.safeParse({
        alias: "fast",
        providerId: "p",
        providerModel: "",
      }).success,
    ).toBe(false)
  })
})
