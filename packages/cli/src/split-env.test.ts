import { describe, expect, it } from "bun:test"
import { splitEnv } from "./mutate-command"

describe("splitEnv", () => {
  it("parses a comma list of K=V pairs into a string map", () => {
    expect(splitEnv({ env: "A=1,B=two" })).toEqual({ A: "1", B: "two" })
  })

  it("returns an empty map when --env is absent", () => {
    expect(splitEnv({})).toEqual({})
  })

  it("returns an empty map when --env is a bare boolean flag", () => {
    expect(splitEnv({ env: true })).toEqual({})
  })

  it("keeps '=' inside a value by splitting on the first '=' only", () => {
    expect(splitEnv({ env: "URL=https://x/?a=b" })).toEqual({
      URL: "https://x/?a=b",
    })
  })

  it("trims keys and drops entries with an empty key or no '='", () => {
    expect(splitEnv({ env: " A = 1 ,,NOPE,=2,B=3" })).toEqual({
      A: " 1 ",
      B: "3",
    })
  })
})
