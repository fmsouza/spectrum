import { describe, expect, it } from "bun:test"
import { ModelAliasSchema } from "./alias"

describe("ModelAliasSchema", () => {
  it("parses a valid alias mapping", () => {
    const a = {
      alias: "fast",
      providerId: "p_openai",
      providerModel: "gpt-4o-mini",
    }
    expect(ModelAliasSchema.parse(a)).toEqual(a)
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
