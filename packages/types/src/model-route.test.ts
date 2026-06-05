import { describe, expect, it } from "bun:test"
import { ModelRouteSchema } from "./model-route"

describe("ModelRouteSchema", () => {
  it("parses a valid model route when all fields are present", () => {
    const parsed = ModelRouteSchema.parse({
      id: "mdl_123",
      providerId: "openai",
      providerModel: "gpt-4o",
    })
    expect(String(parsed.id)).toBe("mdl_123")
    expect(String(parsed.providerId)).toBe("openai")
    expect(parsed.providerModel).toBe("gpt-4o")
  })

  it("rejects an empty providerModel when parsing", () => {
    expect(() =>
      ModelRouteSchema.parse({
        id: "mdl_123",
        providerId: "openai",
        providerModel: "",
      }),
    ).toThrow()
  })

  it("rejects an empty id when parsing", () => {
    expect(() =>
      ModelRouteSchema.parse({
        id: "",
        providerId: "openai",
        providerModel: "gpt-4o",
      }),
    ).toThrow()
  })
})
