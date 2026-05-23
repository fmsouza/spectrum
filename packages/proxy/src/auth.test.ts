import { describe, it, expect } from "bun:test"
import { checkAuth } from "./auth"

const KEY = "secret-proxy-key"

describe("checkAuth", () => {
  it("accepts a request with a matching Bearer token", () => {
    expect(checkAuth(new Headers({ authorization: `Bearer ${KEY}` }), KEY)).toEqual({ ok: true, value: undefined })
  })
  it("accepts a request with a matching x-api-key header", () => {
    expect(checkAuth(new Headers({ "x-api-key": KEY }), KEY)).toEqual({ ok: true, value: undefined })
  })
  it("returns unauthorized when no credential is present", () => {
    expect(checkAuth(new Headers(), KEY)).toEqual({ ok: false, error: { kind: "unauthorized" } })
  })
  it("returns unauthorized when the credential does not match", () => {
    expect(checkAuth(new Headers({ "x-api-key": "wrong" }), KEY)).toEqual({ ok: false, error: { kind: "unauthorized" } })
  })
})
