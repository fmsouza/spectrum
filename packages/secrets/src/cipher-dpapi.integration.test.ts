import { describe, expect, it } from "bun:test"
import { createBunProcessRunner } from "./bun-process-runner"
import { createDpapiCipher } from "./cipher-dpapi"

// Real PowerShell + DPAPI only exist on Windows — skip elsewhere.
const describeWin = process.platform === "win32" ? describe : describe.skip

describeWin("createDpapiCipher (real DPAPI)", () => {
  it("round-trips a secret through real DPAPI Protect/Unprotect", async () => {
    const cipher = createDpapiCipher({ runner: createBunProcessRunner() })
    const enc = await cipher.encrypt("sk-windows-secret")
    expect(enc.ok).toBe(true)
    if (!enc.ok) return
    expect(enc.value).not.toContain("sk-windows-secret")
    expect(await cipher.decrypt(enc.value)).toEqual({ ok: true, value: "sk-windows-secret" })
  })
})
