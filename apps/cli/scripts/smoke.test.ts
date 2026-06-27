import { describe, expect, it } from "bun:test"
import { createMemoryWriter, runCli } from "@spectrum/cli"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createInMemoryConfigFile,
  defaultConfig,
} from "@spectrum/config"
import { builtinHarnesses } from "@spectrum/harnesses"
import { createNoopLogger } from "@spectrum/logger"
import { type SmokeCheck, parseSmokeArgs } from "./smoke"

describe("parseSmokeArgs", () => {
  it("uses .exe suffix on win32", () => {
    expect(parseSmokeArgs("win32").binName).toBe("spectrum-cli.exe")
  })

  it("uses bare name on darwin", () => {
    expect(parseSmokeArgs("darwin").binName).toBe("spectrum-cli")
  })

  it("uses bare name on linux", () => {
    expect(parseSmokeArgs("linux").binName).toBe("spectrum-cli")
  })
})

describe("SmokeCheck", () => {
  it("exposes the two policy variants", () => {
    const checks: readonly SmokeCheck[] = [
      "require-exit-0",
      "require-exit-0-and-output",
    ]
    expect(checks).toHaveLength(2)
  })
})

// A minimal, fully in-memory CliDeps for the contract cases below. Mirrors the stub in
// apps/cli/src/e2e.integration.test.ts: registry seeded with the real builtin harnesses
// (so `list harnesses` is non-empty), config seeded empty (so `list providers` is empty
// but ok), everything else a no-op. Platform-agnostic — no fs/db/keychain, runs on any CI OS.
const makeSmokeDeps = () => {
  const out = createMemoryWriter()
  const file = createInMemoryConfigFile(JSON.stringify(defaultConfig()))
  const config = createCachedConfigStore(createFileConfigStore({ file }))
  const deps = {
    config,
    secrets: {
      set: async () => ({ ok: true, value: { ref: "kc" } }),
      get: async () => ({ ok: true, value: "x" }),
      delete: async () => ({ ok: true, value: undefined }),
      has: async () => false,
    },
    sessions: {
      init: () => ({ ok: true, value: undefined }),
      create: () => ({ ok: true, value: {} }),
      close: () => ({ ok: true, value: {} }),
      query: () => ({ ok: true, value: [] }),
    },
    projects: {
      findOrCreate: async () => ({ ok: true, value: { id: "p" } }),
      list: async () => ({ ok: true, value: [] }),
    },
    runtime: {
      readProxyKey: async () => null,
      writeProxyKey: async () => ({ ok: true, value: undefined }),
      clear: async () => {},
    },
    registry: {
      list: async () => ({ ok: true as const, value: builtinHarnesses }),
    },
    launch: () => ({
      ok: true as const,
      value: { pid: 1, exited: Promise.resolve(0) },
    }),
    proxy: {
      isRunning: async () => false,
      start: () => ({ hostname: "127.0.0.1", port: 0, stop: () => {} }),
    },
    genProxyKey: () => "k",
    logger: createNoopLogger(),
    out,
  } as never
  return { deps, out }
}

// Guards the smoke↔CLI contract: smoke.ts runs exactly these two argv shapes against the
// compiled binary. If a future CLI refactor ever stops accepting them as ok, the smoke
// breaks in CI — fail here first, not on every platform in a canary run.
describe("smoke command contract", () => {
  it("`list harnesses` dispatches to ok and prints the built-in ids", async () => {
    const { deps, out } = makeSmokeDeps()
    const result = await runCli(deps)(["list", "harnesses"])
    expect(result.ok).toBe(true)
    expect(out.lines.length).toBeGreaterThan(0)
    expect(out.lines.join("\n")).toContain("claude")
  })

  it("`list providers` dispatches to ok (may print nothing; exit 0 is all the smoke requires)", async () => {
    const { deps } = makeSmokeDeps()
    const result = await runCli(deps)(["list", "providers"])
    expect(result.ok).toBe(true)
  })

  it("`--help` is NOT a valid command (regression: CI must never call it)", async () => {
    const { deps } = makeSmokeDeps()
    const result = await runCli(deps)(["--help"])
    // --help is a flag, never the command → empty command → usage error.
    expect(result.ok).toBe(false)
  })
})
