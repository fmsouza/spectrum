import { describe, expect, it } from "bun:test"
import { claude } from "@launchkit/harnesses"
import { createProjectStore } from "@launchkit/projects"
import { err, ok } from "@launchkit/utils"
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
    mkdirSync: record("mkdirSync") as never,
    createFsConfigFile: record("createFsConfigFile") as never,
    createFileConfigStore: record("createFileConfigStore") as never,
    createCachedConfigStore: record("createCachedConfigStore") as never,
    createMacosSecurityBackend: record("createMacosSecurityBackend") as never,
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
    createDirHarnessFileSource: record("createDirHarnessFileSource") as never,
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
    createBunScrollbackFs: record("createBunScrollbackFs") as never,
    createFileScrollbackStore: ((..._a: unknown[]) => {
      calls.createFileScrollbackStore = _a
      return { read: () => ok(new Uint8Array()) }
    }) as never,
    createFfiPty: (() => ({ open: () => ok({}) })) as never,
    createTerminalManager: ((..._a: unknown[]) => {
      calls.createTerminalManager = _a
      return {
        launch: () => ok({ sessionId: "s1" }),
        handleInbound: () => undefined,
        bindSend: () => undefined,
      }
    }) as never,
    startTerminalSocket: (() => ({
      url: "ws://localhost:12345/",
      stop: () => undefined,
    })) as never,
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
      "/home/tester/.config/launchkit/config.json",
    )
    // the file store receives that fs file ...
    expect(calls.createFileConfigStore?.[0]).toEqual({
      file: { __stub: "createFsConfigFile" },
    })
    // ... and the cached store wraps the file store
    expect(calls.createCachedConfigStore?.[0]).toEqual({
      __stub: "createFileConfigStore",
    })
  })

  it("builds the secret store from a macOS backend driven by a Bun process runner + crypto id gen", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls.createMacosSecurityBackend?.[0]).toEqual({
      runner: { __stub: "createBunProcessRunner" },
    })
    expect(calls.createSecretStore?.[0]).toEqual({
      backend: { __stub: "createMacosSecurityBackend" },
      idGen: { __stub: "createCryptoIdGen" },
    })
  })

  it("builds the session store from a bun:sqlite database at the resolved db path with a system clock", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls.createSqliteClient?.[0] as string).toContain(
      "/home/tester/.config/launchkit/launchkit.db",
    )
    const sessionArgs = calls.createSessionStore?.[0] as {
      db: unknown
      clock: unknown
      idGen: unknown
    }
    expect(sessionArgs.db).toEqual({ __stub: "dbClient" })
    expect(sessionArgs.clock).toEqual({ __stub: "createSystemClock" })
  })

  it("builds the runtime state at the resolved runtime.json path and exposes it", () => {
    const { deps, calls } = makeFakeDeps()
    const ctx = createAppContext(deps)

    expect(calls.createFileRuntimeState?.[0] as string).toContain(
      "/home/tester/.config/launchkit/runtime.json",
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

  it("builds the harness registry from a directory file source at the resolved harness dir", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls.createDirHarnessFileSource?.[0] as string).toContain(
      "/home/tester/.config/launchkit/harnesses",
    )
    expect(calls.createRegistry?.[0]).toEqual({
      fileSource: { __stub: "createDirHarnessFileSource" },
    })
  })

  it("partially applies launchHarness with the real resolver + spawner", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls.launchHarness?.[0]).toEqual({
      resolver: { __stub: "createPathCommandResolver" },
      spawner: { __stub: "createBunProcessSpawner" },
    })
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

  it("builds the terminal manager from an ffi pty + the session store's create/close and exposes it", () => {
    const { deps, calls } = makeFakeDeps()
    const ctx = createAppContext(deps)

    // the manager is wired with the ffi pty adapter, the session sink, and the defaults
    const managerArgs = calls.createTerminalManager?.[0] as {
      pty: unknown
      sessions: { create: unknown; close: unknown }
      scrollback: unknown
      send: unknown
      capBytes: number
      defaultSize: { cols: number; rows: number }
    }
    expect(typeof managerArgs.pty).toBe("object")
    expect(typeof managerArgs.sessions.create).toBe("function")
    expect(typeof managerArgs.sessions.close).toBe("function")
    expect(typeof managerArgs.scrollback).toBe("object")
    expect(typeof managerArgs.send).toBe("function")
    expect(managerArgs.capBytes).toBe(1_000_000)
    expect(managerArgs.defaultSize).toEqual({ cols: 80, rows: 24 })

    // and the wired manager is exposed on the context
    expect(typeof ctx.terminal.launch).toBe("function")
    expect(typeof ctx.terminal.handleInbound).toBe("function")
    expect(typeof ctx.terminal.bindSend).toBe("function")

    // mkdirSync was called to ensure the scrollback dir exists before first use
    expect(calls.mkdirSync?.[0] as string).toContain(
      "/home/tester/.config/launchkit/scrollback",
    )
    expect(calls.mkdirSync?.[1]).toEqual({ recursive: true })
  })

  it("builds the file scrollback store under the config dir and injects it into the terminal manager", () => {
    const { deps, calls } = makeFakeDeps()
    const ctx = createAppContext(deps)

    expect(
      (calls.createFileScrollbackStore?.[0] as { dir: string }).dir,
    ).toContain("/home/tester/.config/launchkit/scrollback")
    expect(
      (calls.createFileScrollbackStore?.[0] as { fs: unknown }).fs,
    ).toEqual({ __stub: "createBunScrollbackFs" })
    const managerArgs = calls.createTerminalManager?.[0] as {
      scrollback: unknown
    }
    expect(managerArgs.scrollback).toEqual({ read: expect.any(Function) })
    // The store's read is exposed for the scrollback handler.
    expect(typeof ctx.readScrollback).toBe("function")
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
