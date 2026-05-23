import { describe, expect, it } from "bun:test"
import { err, isErr, isOk, ok } from "./result"

describe("Result constructors", () => {
  it("creates an Ok carrying the value when ok() is called", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 })
  })
  it("creates an Err carrying the error when err() is called", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" })
  })
  it("narrows to Ok when isOk() is true", () => {
    const r = ok(1)
    expect(isOk(r)).toBe(true)
    if (isOk(r)) expect(r.value).toBe(1)
  })
  it("narrows to Err when isErr() is true", () => {
    const r = err("e")
    expect(isErr(r)).toBe(true)
    if (isErr(r)) expect(r.error).toBe("e")
  })
})
