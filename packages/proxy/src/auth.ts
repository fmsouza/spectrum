import { type Result, err, ok } from "@spectrum/utils"
import { decodeSessionToken } from "./session-token"
import type { ProxyError } from "./types"

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type AuthPrincipal =
  | { readonly kind: "master" }
  | { readonly kind: "session"; readonly fallbackModelId: string }

export const checkAuth = (
  headers: Headers,
  proxyKey: string,
): Result<AuthPrincipal, ProxyError> => {
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const apiKey = headers.get("x-api-key") ?? undefined
  const presented = bearer ?? apiKey
  if (presented === undefined) return err({ kind: "unauthorized" })
  const { masterKey, modelId } = decodeSessionToken(presented)
  if (!constantTimeEquals(masterKey, proxyKey)) return err({ kind: "unauthorized" })
  return ok(
    modelId === undefined
      ? { kind: "master" }
      : { kind: "session", fallbackModelId: modelId },
  )
}
