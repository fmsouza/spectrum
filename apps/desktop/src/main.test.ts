import { describe, expect, it } from "bun:test"
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
          aliases: [],
          settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        },
      }),
    },
    secrets: {},
    sessions: {
      create: () => ({ ok: true, value: {} }),
      query: () => ({ ok: true, value: [] }),
      init: () => ({ ok: true, value: undefined }),
    },
    registry: { list: async () => ({ ok: true, value: [] }) },
    launch: () => ({ ok: true, value: { pid: 1 } }),
    proxy: {
      isRunning: async () => false,
      start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }),
    },
    factory: {},
    gateway: {},
    testProvider: async () => ({ ok: true, value: { ok: true, latencyMs: 0 } }),
    proxyPort: 4000,
    proxyBaseUrl: "http://127.0.0.1:4000",
    genProxyKey: () => "k",
    paths: { configFile: "", dbFile: "", harnessDir: "" },
  }) as never) as typeof createAppContext

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
    // A real `process.argv` for `launchkit list harnesses` is [runtime, script, "list", "harnesses"].
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
