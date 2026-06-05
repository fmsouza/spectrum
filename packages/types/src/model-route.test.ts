import { describe, expect, it } from "bun:test"
import { ModelRouteSchema } from "./model-route"

describe("ModelRouteSchema", () => {
  it("parses a valid model route when all fields are present", () => {
    const parsed = ModelRouteSchema.parse({
      id: "mdl_123",
      providerId: "openai",
      providerModel: "gpt-4o",
    })
    expect(parsed.id).toBe<string>("mdl_123")
    expect(parsed.providerId).toBe<string>("openai")
    expect(parsed.providerModel).toBe("gpt-4o")
  })

  it("rejects an empty providerModel when parsing", () => {
    expect(
      ModelRouteSchema.safeParse({
        id: "mdl_123",
        providerId: "openai",
        providerModel: "",
      }).success,
    ).toBe(false)
  })

  it("rejects an empty id when parsing", () => {
    expect(
      ModelRouteSchema.safeParse({
        id: "",
        providerId: "openai",
        providerModel: "gpt-4o",
      }).success,
    ).toBe(false)
  })
})
