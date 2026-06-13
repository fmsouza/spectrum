import { err, isOk, ok } from "@spectrum/utils"
import type { SecretCipher } from "./cipher"
import type { ProcessRunner } from "./process-runner"

const PS_FLAGS = ["-NoProfile", "-NonInteractive", "-Command"] as const

// Reads base64 on stdin, DPAPI-Protects (CurrentUser), writes base64 to stdout.
const PROTECT =
  "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;" +
  "$i=[Console]::In.ReadToEnd().Trim();$b=[Convert]::FromBase64String($i);" +
  "$o=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser');" +
  "[Convert]::ToBase64String($o)"

// Reads base64 protected on stdin, DPAPI-Unprotects, writes base64(plaintext) to stdout.
const UNPROTECT =
  "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;" +
  "$i=[Console]::In.ReadToEnd().Trim();$b=[Convert]::FromBase64String($i);" +
  "$o=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');" +
  "[Convert]::ToBase64String($o)"

/**
 * Windows DPAPI cipher via PowerShell `ProtectedData` (user-scoped). OS-backed at-rest encryption
 * with no native module. Plaintext/ciphertext cross the boundary as base64 on stdin/stdout — never
 * on argv.
 */
export const createDpapiCipher = (deps: {
  readonly runner: ProcessRunner
}): SecretCipher => ({
  encrypt: async (plaintext) => {
    const stdin = Buffer.from(plaintext, "utf8").toString("base64")
    const r = await deps.runner.run("powershell", [...PS_FLAGS, PROTECT], {
      stdin,
    })
    return isOk(r) ? ok(r.value.stdout.trim()) : err(r.error)
  },
  decrypt: async (envelope) => {
    const r = await deps.runner.run("powershell", [...PS_FLAGS, UNPROTECT], {
      stdin: envelope,
    })
    if (!isOk(r)) return err(r.error)
    return ok(Buffer.from(r.value.stdout.trim(), "base64").toString("utf8"))
  },
})
