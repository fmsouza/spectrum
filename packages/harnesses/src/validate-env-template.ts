import { type Result, ok, err } from "@launchkit/utils"
import { ALLOWED_TOKENS, type AllowedToken } from "./tokens"
import type { HarnessError } from "./errors"

const TOKEN = /\{\{(\w+)\}\}/g

const isAllowed = (token: string): token is AllowedToken =>
  (ALLOWED_TOKENS as readonly string[]).includes(token)

/** Rejects any `{{token}}` in any env value that is not one of ALLOWED_TOKENS. */
export const validateEnvTemplate = (
  envTemplate: Readonly<Record<string, string>>,
): Result<void, HarnessError> => {
  for (const value of Object.values(envTemplate)) {
    for (const match of value.matchAll(TOKEN)) {
      const token = match[1] ?? ""
      if (!isAllowed(token)) return err({ kind: "invalid-template", token })
    }
  }
  return ok(undefined)
}
