import { describe, expect, it } from "bun:test"
import { isErr, isOk } from "@spectrum/utils"
import { tryDb } from "./wrap"

describe("tryDb", () => {
  it("returns ok with the value when the function does not throw", () => {
    const r = tryDb(() => 42)
    expect(isOk(r) && r.value).toBe(42)
  })

  it("returns err query-failed with the message when the function throws an Error", () => {
    const r = tryDb(() => {
      throw new Error("boom")
    })
    expect(r).toEqual({
      ok: false,
      error: { kind: "query-failed", detail: "boom" },
    })
  })

  it("stringifies a non-Error throw into the detail when the function throws a non-Error", () => {
    const r = tryDb(() => {
      throw "nope"
    })
    expect(isErr(r) && r.error.kind).toBe("query-failed")
    expect(isErr(r) && r.error.detail).toBe("nope")
  })
})
