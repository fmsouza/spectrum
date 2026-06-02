import { describe, expect, it } from "bun:test"
import type { Config } from "@launchkit/config"
import {
  createFakeCommandResolver,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
import type { Provider, Session } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import type { AppContext } from "../../composition"
import { createIpcHandlers } from "./handlers"

// --- a fully in-memory AppContext fake -------------------------------------------------

const provider = (over: Partial<Provider> = {}): Provider =>
  ({
    id: "p_openai",
    name: "OpenAI",
    sdkProvider: "openai",
    config: { baseUrl: "https://api.openai.com/v1" },
    secrets: { apiKey: { ref: "kc_openai" } },
    models: ["gpt-4o"],
    ...over,
  }) as Provider

const baseConfig = (providers: readonly Provider[]): Config =>
  ({
    version: 2,
    providers,
    aliases: [],
    settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  }) as Config

/** Build a fake AppContext, capturing every save + secret set so tests can assert behavior. */
const makeCtx = (
  over: {
    providers?: readonly Provider[]
    setResult?: Result<{ readonly ref: string }, { readonly kind: string }>
    proxyRunning?: boolean
    proxyPort?: number
    session?: Session
    launchOk?: boolean
    terminalOk?: boolean
    proxyKeyStored?: string | null
    registryAddOk?: boolean
    registryRemoveOk?: boolean
  } = {},
): {
  ctx: AppContext
  saves: Config[]
  secretSets: string[]
  launchParams: unknown[]
  sessionInputs: unknown[]
  terminalInputs: unknown[]
  registryAdds: unknown[]
  registryRemoves: string[]
} => {
  const saves: Config[] = []
  const secretSets: string[] = []
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  const terminalInputs: unknown[] = []
  const registryAdds: unknown[] = []
  const registryRemoves: string[] = []
  let current = baseConfig(over.providers ?? [provider()])

  // The handler resolves the harness command+env via ctx.resolveLaunch — use the REAL renderer
  // over a fake resolver so the rendered proxy vars (ANTHROPIC_*) are asserted faithfully.
  const resolveLaunch = resolveHarnessLaunch({
    resolver: createFakeCommandResolver({ claude: "/usr/local/bin/claude" }),
  })

  const ctx = {
    config: {
      load: async (): Promise<Result<Config, never>> => ok(current),
      save: async (next: Config): Promise<Result<void, never>> => {
        saves.push(next)
        current = next
        return ok(undefined)
      },
    },
    secrets: {
      set: async (value: string) => {
        secretSets.push(value)
        return over.setResult ?? ok({ ref: "kc_new" })
      },
      get: async () => ok("sk-never-leaves"),
      delete: async () => ok(undefined),
      has: async () => true,
    },
    sessions: {
      init: () => ok(undefined),
      create: (input: unknown) => {
        sessionInputs.push(input)
        return over.session !== undefined ? ok(over.session) : ok(sampleSession)
      },
      close: () => ok(sampleSession),
      query: () => ok([sampleSession]),
    },
    launch: (params: unknown) => {
      launchParams.push(params)
      return over.launchOk === false
        ? err({ kind: "spawn-failed", detail: "ENOENT" })
        : ok({ pid: 4321, exited: Promise.resolve(0) })
    },
    proxy: {
      isRunning: async () => over.proxyRunning ?? true,
      start: () => ({
        hostname: "127.0.0.1",
        port: over.proxyPort ?? 4000,
        stop: () => {},
      }),
    },
    proxyPort: over.proxyPort ?? 4000,
    proxyBaseUrl: `http://127.0.0.1:${over.proxyPort ?? 4000}`,
    testProvider: async () => ok({ ok: true, latencyMs: 12 }),
    runtime: {
      readProxyKey: async () => over.proxyKeyStored ?? null,
      writeProxyKey: async () => ok(undefined),
      clear: async () => undefined,
    },
    terminal: {
      launch: (input: unknown) => {
        terminalInputs.push(input)
        return over.terminalOk === false
          ? err({ kind: "pty-open-failed", detail: "ENOENT" })
          : ok({ sessionId: sampleSession.id })
      },
      handleInbound: () => undefined,
      bindSend: () => undefined,
    },
    resolveLaunch,
    registry: {
      list: async () =>
        ok([
          {
            id: "claude",
            name: "Claude Code",
            command: "claude",
            apiFormat: "anthropic",
            envTemplate: {
              ANTHROPIC_BASE_URL: "{{proxyUrl}}",
              ANTHROPIC_API_KEY: "{{proxyKey}}",
              ANTHROPIC_MODEL: "{{model}}",
            },
            defaultAlias: "default",
            builtIn: true,
          },
        ]),
      add: async (definition: unknown) => {
        registryAdds.push(definition)
        return over.registryAddOk === false
          ? err({ kind: "write-failed", detail: "EACCES" })
          : ok(undefined)
      },
      remove: async (id: string) => {
        registryRemoves.push(id)
        return over.registryRemoveOk === false
          ? err({ kind: "write-failed", detail: "EACCES" })
          : ok(undefined)
      },
    },
    genProxyKey: () => "test-key",
    factory: {},
    gateway: {},
    paths: {
      configFile: "/tmp/config.json",
      dbFile: "/tmp/launchkit.db",
      harnessDir: "/tmp/harnesses",
    },
  } as unknown as AppContext

  return {
    ctx,
    saves,
    secretSets,
    launchParams,
    sessionInputs,
    terminalInputs,
    registryAdds,
    registryRemoves,
  }
}

const sampleHarness = {
  id: "my-tool",
  name: "My Tool",
  command: "my-tool",
  apiFormat: "openai",
  envTemplate: {
    OPENAI_BASE_URL: "{{proxyUrl}}",
    OPENAI_API_KEY: "{{proxyKey}}",
    OPENAI_MODEL: "{{model}}",
  },
  defaultAlias: "default",
  builtIn: false,
} as const

const sampleSession: Session = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-05-23T10:00:00.000Z",
} as Session

// --- tests -----------------------------------------------------------------------------

describe("createIpcHandlers.getProviders", () => {
  it("projects each Provider to a ProviderView with presence-only secret fields when listing", async () => {
    const { ctx } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    const views = await handlers.getProviders(undefined)

    expect(views).toEqual([
      {
        id: "p_openai",
        name: "OpenAI",
        sdkProvider: "openai",
        config: { baseUrl: "https://api.openai.com/v1" },
        secretFields: { apiKey: { isSet: true } },
        models: ["gpt-4o"],
      },
    ])
  })

  it("never emits a secret ref or value in the ProviderView when listing", async () => {
    const { ctx } = makeCtx({
      providers: [provider({ secrets: { apiKey: { ref: "kc_secret_ref" } } })],
    })
    const handlers = createIpcHandlers(ctx)

    const serialized = JSON.stringify(await handlers.getProviders(undefined))

    expect(serialized).not.toContain("kc_secret_ref")
    expect(serialized).not.toContain('"ref"')
    expect(serialized).not.toContain("sk-")
  })

  it("marks a secret field isSet:true for every keychain ref the provider holds", async () => {
    const { ctx } = makeCtx({
      providers: [
        provider({
          secrets: {
            apiKey: { ref: "kc_a" },
            secretAccessKey: { ref: "kc_b" },
          },
        }),
      ],
    })
    const handlers = createIpcHandlers(ctx)

    const [view] = await handlers.getProviders(undefined)

    expect(view?.secretFields).toEqual({
      apiKey: { isSet: true },
      secretAccessKey: { isSet: true },
    })
  })
})

describe("createIpcHandlers.setProviderSecret", () => {
  it("stores the raw value in the keychain and saves the returned ref onto the provider", async () => {
    const { ctx, saves, secretSets } = makeCtx({
      providers: [provider({ secrets: {} })],
      setResult: ok({ ref: "kc_minted" }),
    })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.setProviderSecret({
      providerId: "p_openai" as never,
      field: "apiKey",
      value: "sk-live-secret",
    })

    // void result encoded as null
    expect(result).toBeNull()
    // the raw value went to the keychain ...
    expect(secretSets).toEqual(["sk-live-secret"])
    // ... and only the ref (never the value) is persisted on the provider
    expect(saves).toHaveLength(1)
    const saved = saves[0]?.providers.find(
      (p) => p.id === ("p_openai" as never),
    )
    expect(saved?.secrets).toEqual({ apiKey: { ref: "kc_minted" } })
  })

  it("throws so the server surfaces handler-failed when the keychain set fails", async () => {
    const { ctx } = makeCtx({
      providers: [provider({ secrets: {} })],
      setResult: err({ kind: "backend-failed" }),
    })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.setProviderSecret({
        providerId: "p_openai" as never,
        field: "apiKey",
        value: "sk-x",
      }),
    ).rejects.toThrow()
  })

  it("throws when setProviderSecret targets a provider id that does not exist", async () => {
    const { ctx } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.setProviderSecret({
        providerId: "p_ghost" as never,
        field: "apiKey",
        value: "sk-x",
      }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.launchHarness", () => {
  it("resolves the harness env and opens a terminal session, returning the sessionId", async () => {
    const { ctx, terminalInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: "stored-run-key",
      proxyPort: 4000,
    })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.launchHarness({
      id: "claude" as never,
      alias: "fast" as never,
    })

    // The terminal manager owns session creation; the handler returns only the sessionId.
    expect(result).toEqual({ sessionId: sampleSession.id })
    expect(terminalInputs).toHaveLength(1)
    const input = terminalInputs[0] as {
      harnessId: string
      alias: string
      command: string
      env: Record<string, string>
    }
    expect(input.harnessId).toBe("claude")
    expect(input.alias).toBe("fast")
    expect(input.command).toBe("/usr/local/bin/claude")
    // The rendered proxy vars carry the loopback proxy URL + the stored per-run key + alias.
    expect(input.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000")
    expect(input.env.ANTHROPIC_API_KEY).toBe("stored-run-key")
    expect(input.env.ANTHROPIC_MODEL).toBe("fast")
  })

  it("does NOT create a duplicate session directly — the terminal manager owns it", async () => {
    const { ctx, sessionInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as never })

    expect(sessionInputs).toEqual([])
  })

  it("falls back to a freshly minted proxy key when none is stored", async () => {
    const { ctx, terminalInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: null,
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as never })

    const input = terminalInputs[0] as { env: Record<string, string> }
    expect(input.env.ANTHROPIC_API_KEY).toBe("test-key") // ctx.genProxyKey()
  })

  it("throws so the server surfaces handler-failed when terminal.launch errors", async () => {
    const { ctx } = makeCtx({ providers: [provider()], terminalOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({ id: "claude" as never }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.addHarness", () => {
  it("persists via the registry and returns the definition", async () => {
    const { ctx, registryAdds } = makeCtx()
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.addHarness(sampleHarness as never)

    expect(result).toEqual(sampleHarness)
    expect(registryAdds).toEqual([sampleHarness])
  })

  it("returns the persisted definition with builtIn forced to false", async () => {
    const { ctx } = makeCtx()
    const handlers = createIpcHandlers(ctx)
    // A webview could send builtIn:true; the registry persists builtIn:false, so the
    // handler reply must match what disk holds, not the raw caller input.
    const spoofed = { ...sampleHarness, builtIn: true } as const

    const result = await handlers.addHarness(spoofed as never)

    expect(result.builtIn).toBe(false)
  })

  it("throws so the server surfaces handler-failed when the registry rejects", async () => {
    const { ctx } = makeCtx({ registryAddOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(handlers.addHarness(sampleHarness as never)).rejects.toThrow()
  })
})

describe("createIpcHandlers.updateHarness", () => {
  it("upserts via registry.add and returns the updated definition", async () => {
    const { ctx, registryAdds } = makeCtx()
    const handlers = createIpcHandlers(ctx)
    const { id, ...input } = sampleHarness

    const result = await handlers.updateHarness({
      id: id as never,
      input: input as never,
    })

    expect(result).toEqual(sampleHarness)
    expect(registryAdds).toEqual([sampleHarness])
  })

  it("returns the updated definition with builtIn forced to false", async () => {
    const { ctx } = makeCtx()
    const handlers = createIpcHandlers(ctx)
    const { id, ...rest } = sampleHarness
    // input arrives with builtIn:true; the registry persists builtIn:false, so the reply must too.
    const input = { ...rest, builtIn: true } as const

    const result = await handlers.updateHarness({
      id: id as never,
      input: input as never,
    })

    expect(result.builtIn).toBe(false)
  })

  it("throws so the server surfaces handler-failed when the registry rejects", async () => {
    const { ctx } = makeCtx({ registryAddOk: false })
    const handlers = createIpcHandlers(ctx)
    const { id, ...input } = sampleHarness

    await expect(
      handlers.updateHarness({ id: id as never, input: input as never }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.deleteHarness", () => {
  it("calls registry.remove and returns null on success", async () => {
    const { ctx, registryRemoves } = makeCtx()
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.deleteHarness({ id: "my-tool" as never })

    expect(result).toBeNull()
    expect(registryRemoves).toEqual(["my-tool"])
  })

  it("throws so the server surfaces handler-failed when removal fails", async () => {
    const { ctx } = makeCtx({ registryRemoveOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.deleteHarness({ id: "my-tool" as never }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.getProxyStatus", () => {
  it("reports running:true and the bound port when the proxy is up", async () => {
    const { ctx } = makeCtx({ proxyRunning: true, proxyPort: 4000 })
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getProxyStatus(undefined)).toEqual({
      running: true,
      port: 4000,
    })
  })

  it("reports running:false when the proxy is not up", async () => {
    const { ctx } = makeCtx({ proxyRunning: false, proxyPort: 4000 })
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getProxyStatus(undefined)).toEqual({
      running: false,
      port: 4000,
    })
  })
})
