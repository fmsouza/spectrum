import { describe, expect, it } from "bun:test"
import { subAgentDetail } from "./subAgentDetail"

describe("subAgentDetail", () => {
  it("prefers the description", () => {
    expect(
      subAgentDetail({
        description: "Investigate tool rendering",
        prompt: "long…",
      }),
    ).toBe("Investigate tool rendering")
  })
  it("falls back to the first line of the prompt", () => {
    expect(subAgentDetail({ prompt: "Fix the side panel\nmore detail" })).toBe(
      "Fix the side panel",
    )
  })
  it("falls back to subagent_type then name", () => {
    expect(subAgentDetail({ subagent_type: "Explore" })).toBe("Explore")
    expect(subAgentDetail({ name: "general-purpose" })).toBe("general-purpose")
  })
  it("returns undefined for empty / non-object input", () => {
    expect(subAgentDetail(undefined)).toBeUndefined()
    expect(subAgentDetail({ foo: 1 })).toBeUndefined()
  })
  it("returns undefined for array input", () => {
    expect(subAgentDetail(["x"])).toBeUndefined()
  })
})
