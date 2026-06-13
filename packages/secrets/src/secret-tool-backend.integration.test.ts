import { describe, expect, it } from "bun:test"
import { createBunProcessRunner } from "./bun-process-runner"
import { isSecretServiceAvailable } from "./secret-service-probe"
import { createSecretToolBackend } from "./secret-tool-backend"

const describeLinux = process.platform === "linux" ? describe : describe.skip

describeLinux("createSecretToolBackend (real secret-tool)", () => {
  it("round-trips a secret when a Secret Service is available, otherwise self-skips", async () => {
    const runner = createBunProcessRunner()
    if (!(await isSecretServiceAvailable({ runner }))) {
      // No keyring/D-Bus in this environment (e.g. headless CI without gnome-keyring) — skip.
      return
    }
    const backend = createSecretToolBackend({ runner })
    const account = `kc_spectrum_test_${crypto.randomUUID()}`
    const secret = `sk-test-${crypto.randomUUID()}`
    try {
      expect((await backend.add(account, secret)).ok).toBe(true)
      expect(await backend.find(account)).toEqual({ ok: true, value: secret })
    } finally {
      await backend.remove(account)
    }
  })
})
