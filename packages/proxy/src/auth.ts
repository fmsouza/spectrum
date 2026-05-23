import { type Result, ok, err } from "@launchkit/utils"
import type { ProxyError } from "./types"

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const checkAuth = (headers: Headers, proxyKey: string): Result<void, ProxyError> => {
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const apiKey = headers.get("x-api-key") ?? undefined
  const presented = bearer ?? apiKey
  if (presented !== undefined && constantTimeEquals(presented, proxyKey)) return ok(undefined)
  return err({ kind: "unauthorized" })
}
