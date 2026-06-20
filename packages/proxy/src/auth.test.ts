import { describe, expect, it } from "bun:test"
import { checkAuth } from "./auth"
import { encodeSessionProxyKey } from "./session-token"

const KEY = "secret-proxy-key"

describe("checkAuth", () => {
  it("accepts a request with a matching Bearer token", () => {
    const r = checkAuth(new Headers({ authorization: `Bearer ${KEY}` }), KEY)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ kind: "master" })
  })
  it("accepts a request with a matching x-api-key header", () => {
    const r = checkAuth(new Headers({ "x-api-key": KEY }), KEY)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ kind: "master" })
  })
  it("returns unauthorized when no credential is present", () => {
    expect(checkAuth(new Headers(), KEY)).toEqual({
      ok: false,
      error: { kind: "unauthorized" },
    })
  })
  it("returns unauthorized when the credential does not match", () => {
    expect(checkAuth(new Headers({ "x-api-key": "wrong" }), KEY)).toEqual({
      ok: false,
      error: { kind: "unauthorized" },
    })
  })
})

it("returns a master principal for a bare valid key", () => {
  const headers = new Headers({ authorization: "Bearer the-master-key" })
  const r = checkAuth(headers, "the-master-key")
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.value).toEqual({ kind: "master" })
})

it("returns a session principal carrying the decoded fallback model id", () => {
  const token = encodeSessionProxyKey("the-master-key", "mdl_selected")
  const headers = new Headers({ authorization: `Bearer ${token}` })
  const r = checkAuth(headers, "the-master-key")
  expect(r.ok).toBe(true)
  if (r.ok)
    expect(r.value).toEqual({
      kind: "session",
      fallbackModelId: "mdl_selected",
    })
})

it("rejects when the master-key portion does not match", () => {
  const token = encodeSessionProxyKey("wrong-key", "mdl_selected")
  const headers = new Headers({ authorization: `Bearer ${token}` })
  const r = checkAuth(headers, "the-master-key")
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.error).toEqual({ kind: "unauthorized" })
})

it("accepts the x-api-key header carrying a session token", () => {
  const token = encodeSessionProxyKey("the-master-key", "mdl_x")
  const headers = new Headers({ "x-api-key": token })
  const r = checkAuth(headers, "the-master-key")
  expect(r.ok).toBe(true)
  if (r.ok)
    expect(r.value).toEqual({ kind: "session", fallbackModelId: "mdl_x" })
})
