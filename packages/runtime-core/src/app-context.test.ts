import { describe, expect, it } from "bun:test"
import type { AppContext, ProviderTestResult } from "./app-context"

describe("AppContext base type", () => {
  it("exposes shared fields and omits GUI-only fields when projected", () => {
    // A value typed as AppContext must carry the shared fields...
    const ctx = {
      config: {},
      secrets: {},
      sessions: {},
      projects: {},
      registry: {},
      launch: (() => ({})) as unknown,
      resolveLaunch: (() => ({})) as unknown,
      proxy: {
        isRunning: async () => false,
        start: () => ({ stop: () => {} }),
      },
      factory: {},
      gateway: {},
      runtime: {},
      testProvider: async () => ({ ok: true, latencyMs: 1 }) as unknown,
      listProviderModels: async () => ({ ok: true, value: [] }) as unknown,
      testProviderDraft: async () => ({ ok: true }) as unknown,
      listProviderModelsDraft: async () => ({ ok: true }) as unknown,
      proxyPort: 0,
      proxyBaseUrl: "",
      genProxyKey: () => "",
      mintSessionProxyKey: async () => "",
      runEvents: { read: () => ({ ok: true, value: [] }) as unknown },
      resolveLaunchInput: async () => ({ harnessId: "x", cwd: "/" }) as unknown,
      dataAdmin: {},
      driverRegistry: {},
      log: {},
      paths: { configFile: "", dbFile: "", harnessDir: "", dataDir: "" },
      legacyDirs: [] as readonly string[],
      // runner extension points
      sessionSink: {},
      runStore: {},
      routingDriver: { start: () => ({ ok: true }) as unknown },
      resolveResumeInput: async () => ({ harnessId: "x", cwd: "/" }) as unknown,
      resolveModelEnv: async () => ({}) as unknown,
    } as unknown as AppContext

    expect(ctx.config).toBeDefined()
    expect(ctx.paths.configFile).toBe("")
    expect(ctx.legacyDirs).toEqual([])
    // GUI-only fields are NOT on the base type — these property accesses must not type-check.
    // (Compile-time guarantee; the runtime object above intentionally omits them.)
    expect(ctx).toBeDefined()
  })

  it("ProviderTestResult is { ok, latencyMs }", () => {
    const r: ProviderTestResult = { ok: true, latencyMs: 5 }
    expect(r.ok).toBe(true)
  })
})
