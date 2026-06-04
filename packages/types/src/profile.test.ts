import { describe, expect, it } from "bun:test"
import { ProfileSchema } from "./profile"

const valid = {
  id: "prof_default",
  name: "Default",
  harnessId: "claude",
  alias: "default",
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("ProfileSchema", () => {
  it("parses a valid profile with an env map", () => {
    const parsed = ProfileSchema.parse(valid)
    expect(parsed.id).toBe<string>("prof_default")
    expect(parsed.name).toBe("Default")
    expect(parsed.harnessId).toBe<string>("claude")
    expect(parsed.alias).toBe<string>("default")
    expect(parsed.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })
  })
  it("parses a profile with an empty env map", () => {
    const parsed = ProfileSchema.parse({ ...valid, env: {} })
    expect(parsed.env).toEqual({})
  })
  it("rejects a profile with an empty name", () => {
    expect(ProfileSchema.safeParse({ ...valid, name: "" }).success).toBe(false)
  })
  it("rejects a profile whose env contains a non-string value", () => {
    expect(
      ProfileSchema.safeParse({ ...valid, env: { PORT: 8080 } }).success,
    ).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(ProfileSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
