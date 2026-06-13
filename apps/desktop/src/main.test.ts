import { describe, expect, it, mock } from "bun:test"
import type { RunAppDeps } from "./app"
import type { createAppContext } from "./composition"
import { buildRealDeps, main } from "./main"

/** Build a fake context with minimal stand-ins so real IO is never triggered. */
const fakeFactory = (() =>
  ({
    config: {
      load: async () => ({
        ok: true,
        value: {
          version: 2,
          providers: [],
          models: [],
          settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        },
      }),
    },
    secrets: {},
    sessions: {
      create: () => ({ ok: true, value: {} }),
      query: () => ({ ok: true, value: [] }),
      init: () => ({ ok: true, value: undefined }),
      reconcileOrphaned: () => ({ ok: true, value: 0 }),
    },
    registry: { list: async () => ({ ok: true, value: [] }) },
    launch: () => ({ ok: true, value: { pid: 1, exited: Promise.resolve(0) } }),
    proxy: {
      isRunning: async () => false,
      start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }),
    },
    factory: {},
    gateway: {},
    runtime: {
      readProxyKey: async () => null,
      writeProxyKey: async () => ({ ok: true, value: undefined }),
      clear: async () => {},
    },
    testProvider: async () => ({ ok: true, value: { ok: true, latencyMs: 0 } }),
    proxyPort: 4000,
    proxyBaseUrl: "http://127.0.0.1:4000",
    genProxyKey: () => "k",
    paths: { configFile: "", dbFile: "", harnessDir: "" },
  }) as never) as typeof createAppContext

describe("module side effects", () => {
  it("does not start the proxy or open a window merely by importing main.ts", async () => {
    const mod = await import("./main")
    expect(typeof mod.main).toBe("function")
    expect(typeof mod.buildRealDeps).toBe("function")
  })
})

describe("buildRealDeps", () => {
  it("produces a RunAppDeps whose runCli, startProxy, and openWindow are callable", () => {
    const deps = buildRealDeps(fakeFactory)
    expect(typeof deps.runCli).toBe("function")
    expect(typeof deps.startProxy).toBe("function")
    expect(typeof deps.openWindow).toBe("function")
  })

  it("threads argv to the CLI runner when runCli is invoked", async () => {
    let cliArgv: readonly string[] | undefined
    const deps = buildRealDeps(fakeFactory, {
      runCli: async (argv) => {
        cliArgv = argv
        return undefined
      },
    })
    await deps.runCli(["bun", "main.ts", "list", "harnesses"])
    expect(cliArgv).toEqual(["bun", "main.ts", "list", "harnesses"])
  })

  it("calls reconcileOrphaned() on the session store when startProxy is invoked (GUI startup)", async () => {
    const reconcileOrphaned = mock(() => ({ ok: true as const, value: 0 }))
    const factoryWithSpy = (() =>
      ({
        config: {
          load: async () => ({
            ok: true,
            value: {
              version: 2,
              providers: [],
              models: [],
              settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
            },
          }),
        },
        secrets: {},
        sessions: {
          create: () => ({ ok: true, value: {} }),
          query: () => ({ ok: true, value: [] }),
          init: () => ({ ok: true, value: undefined }),
          reconcileOrphaned,
        },
        registry: { list: async () => ({ ok: true, value: [] }) },
        launch: () => ({
          ok: true,
          value: { pid: 1, exited: Promise.resolve(0) },
        }),
        proxy: {
          isRunning: async () => false,
          start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }),
        },
        factory: {},
        gateway: {},
        runtime: {
          readProxyKey: async () => null,
          writeProxyKey: async () => ({ ok: true, value: undefined }),
          clear: async () => {},
        },
        testProvider: async () => ({
          ok: true,
          value: { ok: true, latencyMs: 0 },
        }),
        proxyPort: 4000,
        proxyBaseUrl: "http://127.0.0.1:4000",
        genProxyKey: () => "k",
        paths: { configFile: "", dbFile: "", harnessDir: "" },
      }) as never) as typeof createAppContext

    const deps = buildRealDeps(factoryWithSpy)
    // startProxy is the GUI-only path; trigger it and wait for the async load to complete
    deps.startProxy(undefined)
    // The async config.load() is deferred; flush the microtask queue
    await Promise.resolve()
    expect(reconcileOrphaned).toHaveBeenCalledTimes(1)
  })

  it("does NOT call reconcileOrphaned() when only runCli is invoked (CLI path)", async () => {
    const reconcileOrphaned = mock(() => ({ ok: true as const, value: 0 }))
    const factoryWithSpy = (() =>
      ({
        config: {
          load: async () => ({
            ok: true,
            value: {
              version: 2,
              providers: [],
              models: [],
              settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
            },
          }),
        },
        secrets: {},
        sessions: {
          create: () => ({ ok: true, value: {} }),
          query: () => ({ ok: true, value: [] }),
          init: () => ({ ok: true, value: undefined }),
          reconcileOrphaned,
        },
        registry: { list: async () => ({ ok: true, value: [] }) },
        launch: () => ({
          ok: true,
          value: { pid: 1, exited: Promise.resolve(0) },
        }),
        proxy: {
          isRunning: async () => false,
          start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }),
        },
        factory: {},
        gateway: {},
        runtime: {
          readProxyKey: async () => null,
          writeProxyKey: async () => ({ ok: true, value: undefined }),
          clear: async () => {},
        },
        testProvider: async () => ({
          ok: true,
          value: { ok: true, latencyMs: 0 },
        }),
        proxyPort: 4000,
        proxyBaseUrl: "http://127.0.0.1:4000",
        genProxyKey: () => "k",
        paths: { configFile: "", dbFile: "", harnessDir: "" },
      }) as never) as typeof createAppContext

    const deps = buildRealDeps(factoryWithSpy)
    // Only invoke the CLI path, never startProxy
    await deps.runCli(["list"])
    await Promise.resolve()
    expect(reconcileOrphaned).toHaveBeenCalledTimes(0)
  })
})

describe("main (entry wiring)", () => {
  /** A RunAppDeps that records whether/how each path ran, no real effects. */
  const recordingDeps = (record: {
    cliArgv?: readonly string[]
    guiOpened?: boolean
  }): RunAppDeps => ({
    runCli: async (argv) => {
      record.cliArgv = argv
      return undefined
    },
    startProxy: () => ({ stop: () => {} }),
    openWindow: () => {
      record.guiOpened = true
    },
  })

  it("hands the CLI the argv tail (command at index 0), not the runtime/script prefix", async () => {
    const record: { cliArgv?: readonly string[] } = {}
    // A real `process.argv` for `spectrum list harnesses` is [runtime, script, "list", "harnesses"].
    await main(
      ["bun", "/path/main.ts", "list", "harnesses"],
      recordingDeps(record),
    )
    expect(record.cliArgv).toEqual(["list", "harnesses"])
  })

  it("runs GUI mode (no CLI verb) without invoking the CLI runner", async () => {
    const record: { cliArgv?: readonly string[]; guiOpened?: boolean } = {}
    await main(["bun", "/path/main.ts"], recordingDeps(record))
    expect(record.cliArgv).toBeUndefined()
    expect(record.guiOpened).toBe(true)
  })
})
