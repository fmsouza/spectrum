import { afterEach, describe, expect, it } from "bun:test"
import { isOk } from "@spectrum/utils"
import { createBunProcessRunner } from "./bun-process-runner"
import { createMacosSecurityBackend } from "./macos-backend"

// The real `security` CLI only exists on macOS — skip elsewhere.
const onDarwin = process.platform === "darwin"
const describeDarwin = onDarwin ? describe : describe.skip

describeDarwin("createMacosSecurityBackend (real security CLI)", () => {
  const backend = createMacosSecurityBackend({
    runner: createBunProcessRunner(),
  })
  // Unique per run so concurrent/leftover runs never collide in the shared keychain.
  const account = `kc_spectrum_test_${crypto.randomUUID()}`

  afterEach(async () => {
    // Best-effort cleanup; ignore not-found if a test already removed it.
    await backend.remove(account)
  })

  it("round-trips a secret through the macOS keychain when add then find then remove run", async () => {
    const secret = `sk-test-${crypto.randomUUID()}`

    const added = await backend.add(account, secret)
    expect(isOk(added)).toBe(true)

    const found = await backend.find(account)
    expect(found).toEqual({ ok: true, value: secret })

    const removed = await backend.remove(account)
    expect(isOk(removed)).toBe(true)

    const afterRemove = await backend.find(account)
    expect(afterRemove).toEqual({ ok: false, error: { kind: "not-found" } })
  })
})
