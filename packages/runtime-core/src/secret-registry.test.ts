import { describe, expect, it } from "bun:test"
import { createLogger } from "@spectrum/logger"
import type { LogRecord, Sink } from "@spectrum/logger"
import type { RuntimeState } from "@spectrum/proxy"
import type { SecretRef } from "@spectrum/types"
import { createFixedClock, ok, redactSecrets } from "@spectrum/utils"
import {
  createSecretRegistry,
  withRuntimeKeyRegistration,
  withSecretRegistration,
} from "./secret-registry"

describe("createSecretRegistry", () => {
  it("registers a long secret and exposes it in the snapshot", () => {
    const reg = createSecretRegistry()
    reg.register("sk-super-secret-value-1234567890")
    expect(reg.snapshot()).toContain("sk-super-secret-value-1234567890")
  })

  it("ignores empty, nullish, and too-short values (avoids over-redaction)", () => {
    const reg = createSecretRegistry()
    reg.register("")
    reg.register(undefined)
    reg.register(null)
    reg.register("short")
    expect(reg.snapshot()).toEqual([])
  })

  it("dedupes repeated registrations", () => {
    const reg = createSecretRegistry()
    reg.register("sk-super-secret-value-1234567890")
    reg.register("sk-super-secret-value-1234567890")
    expect(reg.snapshot().length).toBe(1)
  })

  it("snapshot reflects values registered after a prior snapshot", () => {
    const reg = createSecretRegistry()
    const before = reg.snapshot()
    reg.register("sk-super-secret-value-1234567890")
    expect(before).toEqual([])
    expect(reg.snapshot()).toContain("sk-super-secret-value-1234567890")
  })
})

describe("withSecretRegistration", () => {
  const ref = { ref: "kc_1" } as SecretRef
  const baseStore = {
    set: async (_v: string) => ok(ref),
    get: async (_r: SecretRef) => ok("sk-resolved-apikey-abcdefghijklmnop"),
    delete: async (_r: SecretRef) => ok(undefined),
    has: async (_r: SecretRef) => true,
  }

  it("registers the value resolved by a successful get", async () => {
    const reg = createSecretRegistry()
    const store = withSecretRegistration(baseStore, reg)
    await store.get(ref)
    expect(reg.snapshot()).toContain("sk-resolved-apikey-abcdefghijklmnop")
  })

  it("registers the value written via set", async () => {
    const reg = createSecretRegistry()
    const store = withSecretRegistration(baseStore, reg)
    await store.set("sk-written-apikey-zyxwvutsrqponml")
    expect(reg.snapshot()).toContain("sk-written-apikey-zyxwvutsrqponml")
  })

  it("does not register when get fails", async () => {
    const reg = createSecretRegistry()
    const failing = {
      ...baseStore,
      get: async (_r: SecretRef) =>
        ({ ok: false, error: { kind: "not-found" } }) as never,
    }
    const store = withSecretRegistration(failing, reg)
    await store.get(ref)
    expect(reg.snapshot()).toEqual([])
  })

  it("delegates delete/has unchanged", async () => {
    const reg = createSecretRegistry()
    const store = withSecretRegistration(baseStore, reg)
    expect(await store.has(ref)).toBe(true)
    const del = await store.delete(ref)
    expect(del.ok).toBe(true)
  })
})

describe("withRuntimeKeyRegistration", () => {
  const base: RuntimeState = {
    readProxyKey: async () => "restored-proxy-key-0123456789abcdef",
    writeProxyKey: async () => ok(undefined),
    clear: async () => {},
  }

  it("registers the key returned by readProxyKey", async () => {
    const reg = createSecretRegistry()
    const rt = withRuntimeKeyRegistration(base, reg)
    expect(await rt.readProxyKey()).toBe("restored-proxy-key-0123456789abcdef")
    expect(reg.snapshot()).toContain("restored-proxy-key-0123456789abcdef")
  })

  it("registers nothing when readProxyKey returns null", async () => {
    const reg = createSecretRegistry()
    const rt = withRuntimeKeyRegistration(
      { ...base, readProxyKey: async () => null },
      reg,
    )
    expect(await rt.readProxyKey()).toBeNull()
    expect(reg.snapshot()).toEqual([])
  })

  it("registers the key written via writeProxyKey and delegates clear", async () => {
    const reg = createSecretRegistry()
    const rt = withRuntimeKeyRegistration(base, reg)
    await rt.writeProxyKey("written-proxy-key-fedcba9876543210")
    expect(reg.snapshot()).toContain("written-proxy-key-fedcba9876543210")
    await rt.clear() // should not throw
  })
})

describe("registry + redactSecrets + createLogger (the wired pipeline)", () => {
  it("redacts a registered secret in both msg and fields of a log record", () => {
    const reg = createSecretRegistry()
    const records: LogRecord[] = []
    const sink: Sink = { write: (r) => records.push(r) }
    const log = createLogger({
      sinks: [sink],
      clock: createFixedClock(new Date("2026-06-15T10:00:00.000Z")),
      minLevel: "debug",
      redact: (text) => redactSecrets(text, reg.snapshot()),
    })
    reg.register("sk-live-proxy-key-0123456789abcdef")
    log.error("auth failed for sk-live-proxy-key-0123456789abcdef", {
      key: "sk-live-proxy-key-0123456789abcdef",
    })
    expect(records[0]?.msg).toBe("auth failed for [REDACTED]")
    expect(records[0]?.fields).toEqual({ key: "[REDACTED]" })
  })
})
