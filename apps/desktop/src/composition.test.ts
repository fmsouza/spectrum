import { describe, expect, it } from "bun:test"
import { claude } from "@spectrum/harnesses"
import { resolveAppPaths } from "@spectrum/platform"
import { createProjectStore } from "@spectrum/projects"
import { err, ok } from "@spectrum/utils"
import { createAppContext } from "./composition"
import type { CreateAppContextDeps } from "./composition"
import { DEMO_HARNESS_ID } from "./gui/driver-registry"

/** Record which constructor saw which argument, returning inert stand-ins. */
const makeFakeDeps = (): {
  deps: CreateAppContextDeps
  calls: Record<string, unknown[]>
} => {
  const calls: Record<string, unknown[]> = {}
  const record =
    (name: string) =>
    (...args: unknown[]): unknown => {
      calls[name] = args
      return { __stub: name }
    }
  const deps: CreateAppContextDeps = {
    homeDir: () => "/home/tester",
    platform: "linux",
    env: {},
    resolveAppPaths,
    ensureDir: ((dir: string) => {
      calls.ensureDir = [dir]
    }) as never,
    migrateLegacyMacosConfig: record("migrateLegacyMacosConfig") as never,
    migrateLaunchkitToSpectrum: record("migrateLaunchkitToSpectrum") as never,
    createFsConfigFile: record("createFsConfigFile") as never,
    createFileConfigStore: record("createFileConfigStore") as never,
    createCachedConfigStore: record("createCachedConfigStore") as never,
    createPlatformKeychainBackend: record(
      "createPlatformKeychainBackend",
    ) as never,
    createSecretFileOps: record("createSecretFileOps") as never,
    secretPassphrase: (async () => null) as never,
    createBunProcessRunner: record("createBunProcessRunner") as never,
    createCryptoIdGen: record("createCryptoIdGen") as never,
    createSecretStore: record("createSecretStore") as never,
    createSqliteClient: ((path: string) => {
      record("createSqliteClient")(path)
      return { ok: true, value: { __stub: "dbClient" } }
    }) as never,
    runMigrations: ((client: unknown) => {
      record("runMigrations")(client)
      return { ok: true, value: undefined }
    }) as never,
    createSystemClock: record("createSystemClock") as never,
    createSessionStore: ((..._a: unknown[]) => {
      calls.createSessionStore = _a
      return {
        create: () => ok(undefined),
        close: () => ok(undefined),
        query: () => ok([]),
        reconcileOrphaned: () => ok(0),
      }
    }) as never,
    createRegistry: record("createRegistry") as never,
    createPathCommandResolver: record("createPathCommandResolver") as never,
    createBunProcessSpawner: record("createBunProcessSpawner") as never,
    launchHarness: ((..._a: unknown[]) => {
      calls.launchHarness = _a
      return (..._p: unknown[]) => ok({ pid: 1, exited: Promise.resolve(0) })
    }) as never,
    createProviderFactory: record("createProviderFactory") as never,
    loadSdk: (async () => ({ create: () => ({}) })) as never,
    createRealGateway: record("createRealGateway") as never,
    createFileRuntimeState: record("createFileRuntimeState") as never,
    genProxyKey: () => "fixed-test-key",
    createProjectStore: createProjectStore,
    createRunStore: ((..._a: unknown[]) => {
      calls.createRunStore = _a
      return { append: () => ok({ seq: 0 }), read: () => ok([]) }
    }) as never,
    createRunManager: ((..._a: unknown[]) => {
      calls.createRunManager = _a
      return {
        launch: () => ok({ sessionId: "s1" }),
        handleInbound: () => undefined,
        bindSend: () => undefined,
      }
    }) as never,
    startRunnerSocket: (() => ({
      url: "ws://localhost:23456/",
      stop: () => undefined,
    })) as never,
    createFakeDriver: (() => ({ start: () => ok({}) })) as never,
    createCodexDriver: (() => ({ start: () => ok({}) })) as never,
    createOpencodeDriver: (() => ({ start: () => ok({}) })) as never,
    createDataAdmin: (() => ({
      deleteSession: () => ok(undefined),
      deleteProject: () => ok(undefined),
    })) as never,
    removeDir: () => {},
    relaunch: () => {},
    demoHarnessEnabled: false,
  }
  return { deps, calls }
}

describe("createAppContext listProviderModels wiring", () => {
  it("exposes ctx.listProviderModels as a function on the context", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.listProviderModels).toBe("function")
  })

  it("returns err when the provider id is not found in the config", async () => {
    const { deps } = makeFakeDeps()
    // Override the fake config store to return a config with no providers.
    ;(deps as { createCachedConfigStore: unknown }).createCachedConfigStore =
      () => ({
        load: async () =>
          ok({
            version: 2,
            providers: [],
            models: [],
            settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
          }),
        save: async () => ok(undefined),
      })
    const ctx = createAppContext(deps)
    const result = await ctx.listProviderModels("p_ghost")
    expect(result.ok).toBe(false)
  })

  it("returns err and does NOT call the lister when the provider has an apiKey ref but secrets.get fails", async () => {
    const { deps } = makeFakeDeps()

    // Provider with an apiKey ref present in secrets.
    ;(deps as { createCachedConfigStore: unknown }).createCachedConfigStore =
      () => ({
        load: async () =>
          ok({
            version: 2,
            providers: [
              {
                id: "p_groq",
                sdkProvider: "groq",
                label: "Groq",
                models: ["llama3-8b-8192"],
                config: {},
                secrets: { apiKey: { ref: "kc_missing" } },
              },
            ],
            models: [],
            settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
          }),
        save: async () => ok(undefined),
      })

    // secrets.get always fails (keychain entry gone / corrupted).
    ;(deps as { createSecretStore: unknown }).createSecretStore = () => ({
      set: async () => ok({ ref: "kc_new" }),
      get: async () => err({ kind: "not-found" } as { kind: "not-found" }),
      delete: async () => ok(undefined),
      has: async () => false,
    })

    const ctx = createAppContext(deps)
    const result = await ctx.listProviderModels("p_groq")

    // The error from secrets.get must be forwarded immediately — the lister
    // (and any outbound HTTP call) must not be reached.
    // We confirm "not reached" structurally: the error kind must be "not-found"
    // (the secrets error), NOT "provider-failed" or "unsupported-model-discovery".
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect((result.error as { kind: string }).kind).toBe("not-found")
    }
  })
})

describe("createAppContext wiring", () => {
  it("builds the config store as a cached store wrapping a file store over an fs config file", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    // fs file is created at the resolved config path under the home dir
    expect(calls.createFsConfigFile?.[0] as string).toContain(
      "/home/tester/.config/spectrum/config.json",
    )
    // the file store receives that fs file ...
    const fileStoreArg = calls.createFileConfigStore?.[0] as {
      file: unknown
      logger: { child: unknown }
    }
    expect(fileStoreArg.file).toEqual({ __stub: "createFsConfigFile" })
    // ... and an injected (scoped) logger
    expect(typeof fileStoreArg.logger.child).toBe("function")
    // ... and the cached store wraps the file store
    expect(calls.createCachedConfigStore?.[0]).toEqual({
      __stub: "createFileConfigStore",
    })
  })

  it("builds the secret store from a platform keychain backend wired with paths + passphrase", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)
    const arg = calls.createPlatformKeychainBackend?.[0] as {
      platform: string
      runner: unknown
      fileOps: unknown
      secretsDir: string
      secretPassphrase: unknown
    }
    expect(arg.platform).toBe("linux")
    expect(arg.runner).toEqual({ __stub: "createBunProcessRunner" })
    expect(arg.fileOps).toEqual({ __stub: "createSecretFileOps" })
    expect(arg.secretsDir).toBe("/home/tester/.config/spectrum/secrets")
    expect(typeof arg.secretPassphrase).toBe("function")
    const secretStoreArg = calls.createSecretStore?.[0] as {
      backend: unknown
      idGen: unknown
      logger: { child: unknown }
    }
    expect(secretStoreArg.backend).toEqual({
      __stub: "createPlatformKeychainBackend",
    })
    expect(secretStoreArg.idGen).toEqual({ __stub: "createCryptoIdGen" })
    expect(typeof secretStoreArg.logger.child).toBe("function")
  })

  it("builds the session store from a bun:sqlite database at the resolved db path with a system clock", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls.createSqliteClient?.[0] as string).toContain(
      "/home/tester/.config/spectrum/spectrum.db",
    )
    const sessionArgs = calls.createSessionStore?.[0] as {
      db: unknown
      clock: unknown
      idGen: unknown
    }
    expect(sessionArgs.db).toEqual({ __stub: "dbClient" })
    expect(sessionArgs.clock).toEqual({ __stub: "createSystemClock" })
  })

  it("creates the data directory before opening the database (fresh install)", () => {
    const { deps, calls } = makeFakeDeps()
    const order: string[] = []
    const ensureDir = ((dir: string) => {
      order.push("ensureDir")
      calls.ensureDir = [dir]
    }) as never
    const createSqliteClient = ((path: string) => {
      order.push("db")
      calls.createSqliteClient = [path]
      return { ok: true, value: { __stub: "dbClient" } }
    }) as never
    createAppContext({ ...deps, ensureDir, createSqliteClient })

    const expected = resolveAppPaths({
      platform: "linux",
      homeDir: "/home/tester",
      env: {},
    })
    // The data dir is created (recursively) before the db open, or a fresh install
    // (no dir yet) throws on `new Database(path)` and the proxy never starts.
    expect(calls.ensureDir?.[0]).toBe(expected.dataDir)
    expect(order.indexOf("ensureDir")).toBeGreaterThanOrEqual(0)
    expect(order.indexOf("ensureDir")).toBeLessThan(order.indexOf("db"))
  })

  it("builds the runtime state at the resolved runtime.json path and exposes it", () => {
    const { deps, calls } = makeFakeDeps()
    const ctx = createAppContext(deps)

    expect(calls.createFileRuntimeState?.[0] as string).toContain(
      "/home/tester/.config/spectrum/runtime.json",
    )
    expect(ctx.runtime).toEqual({ __stub: "createFileRuntimeState" })
  })

  it("runs migrations against the opened client so the schema exists before first use", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)
    // runMigrations must receive the client returned by createSqliteClient,
    // proving open -> migrate -> build-store ordering.
    expect(calls.runMigrations?.[0]).toEqual({ __stub: "dbClient" })
  })

  it("builds the harness registry from an in-memory (builtins-only) file source", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    const arg = calls.createRegistry?.[0] as { fileSource?: unknown }
    // No directory file source is wired (custom user harnesses are gone); the registry receives an
    // in-memory file source so it lists only the builtins.
    expect(typeof arg.fileSource).toBe("object")
    expect(arg.fileSource).not.toBeNull()
  })

  it("partially applies launchHarness with the real resolver + spawner", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    const launchArg = calls.launchHarness?.[0] as {
      resolver: unknown
      spawner: unknown
      logger: { child: unknown }
    }
    expect(launchArg.resolver).toEqual({
      __stub: "createPathCommandResolver",
    })
    expect(launchArg.spawner).toEqual({ __stub: "createBunProcessSpawner" })
    // ... and an injected (scoped) logger
    expect(typeof launchArg.logger.child).toBe("function")
  })

  it("builds the provider factory with the secret store + loadSdk seam", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    const factoryArgs = calls.createProviderFactory?.[0] as {
      secretStore: unknown
      loadSdk: unknown
    }
    expect(factoryArgs.secretStore).toEqual({ __stub: "createSecretStore" })
    expect(typeof factoryArgs.loadSdk).toBe("function")
  })

  it("exposes the loopback proxy base url and port resolved from default config", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    // default config settings: 127.0.0.1:4000
    expect(ctx.proxyBaseUrl).toBe("http://127.0.0.1:4000")
    expect(ctx.proxyPort).toBe(4000)
  })

  it("exposes a pickFolder function on the context", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.pickFolder).toBe("function")
  })

  it("exposes a projects store on the context", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.projects.list).toBe("function")
  })

  it("exposes a structured logger with all severity methods and child scoping", () => {
    const ctx = createAppContext(makeFakeDeps().deps)
    expect(typeof ctx.log.info).toBe("function")
    expect(typeof ctx.log.debug).toBe("function")
    expect(typeof ctx.log.warn).toBe("function")
    expect(typeof ctx.log.error).toBe("function")
    expect(typeof ctx.log.fatal).toBe("function")
    // child returns a Logger and logging never throws (clock stub is never invoked at construction)
    expect(() => ctx.log.child("test")).not.toThrow()
  })

  it("runs the legacy macOS migration with the injected platform/home/env before resolving paths", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)
    expect(calls.migrateLegacyMacosConfig?.[0]).toEqual({
      platform: "linux",
      homeDir: "/home/tester",
      env: {},
    })
  })

  it("runs the LaunchKit→Spectrum migration with the injected platform/home/env after the legacy migration", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)
    expect(calls.migrateLaunchkitToSpectrum?.[0]).toEqual({
      platform: "linux",
      homeDir: "/home/tester",
      env: {},
    })
  })

  it("runs migrateLegacyMacosConfig before migrateLaunchkitToSpectrum (data migration order)", () => {
    const { deps, calls } = makeFakeDeps()
    const order: string[] = []
    const migrateLegacyMacosConfig = ((...args: unknown[]) => {
      order.push("migrateLegacyMacosConfig")
      calls.migrateLegacyMacosConfig = args
    }) as never
    const migrateLaunchkitToSpectrum = ((...args: unknown[]) => {
      order.push("migrateLaunchkitToSpectrum")
      calls.migrateLaunchkitToSpectrum = args
    }) as never
    createAppContext({
      ...deps,
      migrateLegacyMacosConfig,
      migrateLaunchkitToSpectrum,
    })

    expect(order.indexOf("migrateLegacyMacosConfig")).toBeGreaterThanOrEqual(0)
    expect(order.indexOf("migrateLaunchkitToSpectrum")).toBeGreaterThanOrEqual(
      0,
    )
    expect(order.indexOf("migrateLegacyMacosConfig")).toBeLessThan(
      order.indexOf("migrateLaunchkitToSpectrum"),
    )
  })
})

describe("createAppContext dev/prod data isolation", () => {
  it("forwards appEnv=development and skips legacy migrations under SPECTRUM_ENV=development", () => {
    const { deps, calls } = makeFakeDeps()
    ;(deps as { env: unknown }).env = { SPECTRUM_ENV: "development" }
    ;(deps as { resolveAppPaths: unknown }).resolveAppPaths = (
      input: Parameters<typeof resolveAppPaths>[0],
    ) => {
      calls.resolveAppPaths = [input]
      return resolveAppPaths(input)
    }

    createAppContext(deps)

    expect((calls.resolveAppPaths?.[0] as { appEnv?: string }).appEnv).toBe(
      "development",
    )
    expect(
      (calls.createPlatformKeychainBackend?.[0] as { keychainService?: string })
        .keychainService,
    ).toBe("spectrum-dev")
    expect(calls.migrateLegacyMacosConfig).toBeUndefined()
    expect(calls.migrateLaunchkitToSpectrum).toBeUndefined()
  })

  it("forwards appEnv=production and runs legacy migrations when SPECTRUM_ENV is unset", () => {
    const { deps, calls } = makeFakeDeps()
    ;(deps as { resolveAppPaths: unknown }).resolveAppPaths = (
      input: Parameters<typeof resolveAppPaths>[0],
    ) => {
      calls.resolveAppPaths = [input]
      return resolveAppPaths(input)
    }

    createAppContext(deps)

    expect((calls.resolveAppPaths?.[0] as { appEnv?: string }).appEnv).toBe(
      "production",
    )
    expect(
      (calls.createPlatformKeychainBackend?.[0] as { keychainService?: string })
        .keychainService,
    ).toBe("spectrum")
    expect(calls.migrateLegacyMacosConfig).toBeDefined()
    expect(calls.migrateLaunchkitToSpectrum).toBeDefined()
  })
})

describe("createAppContext native run path wiring", () => {
  it("exposes a runner manager with launch/handleInbound/bindSend", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.runner.launch).toBe("function")
    expect(typeof ctx.runner.handleInbound).toBe("function")
    expect(typeof ctx.runner.bindSend).toBe("function")
  })

  it("exposes the runner socket url bound from startRunnerSocket", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(ctx.runnerSocketUrl).toBe("ws://localhost:23456/")
  })

  it("builds the run store from the shared db client + a clock", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)
    const args = calls.createRunStore?.[0] as { db?: unknown; clock?: unknown }
    expect(args?.db).toEqual({ __stub: "dbClient" })
    expect(args?.clock).toBeDefined()
  })

  it("exposes runEvents.read as a function for replay", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.runEvents.read).toBe("function")
  })

  it("registers the claude driver as native by default (hard cutover)", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(ctx.driverRegistry.isNative("demo" as never)).toBe(false)
    expect(ctx.driverRegistry.isNative("claude" as never)).toBe(true)
  })

  it("routes the codex harness natively (driver registered)", () => {
    const ctx = createAppContext(makeFakeDeps().deps)
    expect(ctx.driverRegistry.isNative("codex" as never)).toBe(true)
  })

  it("registers the opencode native driver and routes opencode native", () => {
    const ctx = createAppContext(makeFakeDeps().deps)
    expect(ctx.driverRegistry.isNative("opencode" as never)).toBe(true)
  })

  it("registers the openclaw native driver and routes openclaw native", () => {
    const ctx = createAppContext(makeFakeDeps().deps)
    expect(ctx.driverRegistry.isNative("openclaw" as never)).toBe(true)
  })

  it("surfaces native:true for openclaw via the driver registry (getHarnesses maps def -> {..., native})", () => {
    // getHarnesses maps each builtin definition -> { ...def, native: driverRegistry.isNative(def.id) }.
    // The `openclaw` builtin is always listed (packages/harnesses builtinHarnesses); here we assert the
    // native flag it gets is true now that the driver is registered.
    const ctx = createAppContext(makeFakeDeps().deps)
    expect(ctx.driverRegistry.isNative("openclaw" as never)).toBe(true)
  })

  it("registers the native claude driver even without the demo flag (hard cutover)", () => {
    const ctx = createAppContext({
      ...makeFakeDeps().deps,
      demoHarnessEnabled: false,
    })
    expect(ctx.driverRegistry.isNative("claude" as never)).toBe(true)
    expect(ctx.driverRegistry.isNative("demo" as never)).toBe(false)
  })

  it("makes the demo harness launchable AND native when the demo flag is set (both registries agree)", async () => {
    // The bug this guards: the demo *driver* was registered but no demo *harness* was listed, so the
    // native view was unreachable. With the flag on, the harness registry must LIST `demo` (so the New
    // Session modal offers it) AND the driver registry must mark it native (so it routes to RunDetail).
    const deps: CreateAppContextDeps = {
      ...makeFakeDeps().deps,
      demoHarnessEnabled: true,
      // a real-ish base registry so the withDemoHarness decorator can append to its list
      createRegistry: (() => ({
        list: async () => ok([claude]),
        add: async () => ok(undefined),
        remove: async () => ok(undefined),
      })) as never,
    }
    const ctx = createAppContext(deps)
    const listed = await ctx.registry.list()
    const ids = listed.ok ? listed.value.map((h) => h.id) : []
    expect(ids).toContain(DEMO_HARNESS_ID)
    expect(ids).toContain("claude")
    expect(ctx.driverRegistry.isNative(DEMO_HARNESS_ID as never)).toBe(true)
  })
})
