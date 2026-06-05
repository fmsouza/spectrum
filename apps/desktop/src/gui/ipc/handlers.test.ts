import { describe, expect, it } from "bun:test"
import type { Config } from "@launchkit/config"
import {
  createFakeCommandResolver,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
import { bytesToBase64 } from "@launchkit/pty"
import type {
  HarnessId,
  ModelId,
  Profile,
  Provider,
  ProviderId,
  Session,
} from "@launchkit/types"
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
    models: [],
    profiles: [],
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
    pickFolderResult?: readonly string[]
    scrollback?: Result<Uint8Array, { readonly kind: string }>
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
  pickFolderCalls: unknown[]
  readScrollbackIds: string[]
} => {
  const saves: Config[] = []
  const secretSets: string[] = []
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  const terminalInputs: unknown[] = []
  const registryAdds: unknown[] = []
  const registryRemoves: string[] = []
  const pickFolderCalls: unknown[] = []
  const readScrollbackIds: string[] = []
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
    pickFolder: async (opts: unknown) => {
      pickFolderCalls.push(opts)
      return over.pickFolderResult ?? []
    },
    readScrollback: (id: unknown) => {
      readScrollbackIds.push(id as string)
      return over.scrollback ?? ok(new Uint8Array())
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
    pickFolderCalls,
    readScrollbackIds,
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
  builtIn: false,
} as const

const sampleSession: Session = {
  id: "s_1",
  harnessId: "claude",
  modelId: "mdl_default",
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

describe("createIpcHandlers models CRUD", () => {
  it("getModels returns the routes from the loaded config when listing", async () => {
    const { ctx } = makeCtx()
    const route = {
      id: "mdl_a" as ModelId,
      providerId: "p_openai" as ProviderId,
      providerModel: "gpt-4o",
    }
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      models: [route],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getModels(undefined)).toEqual([route])
  })

  it("addModel mints an id and persists the model", async () => {
    const { ctx, saves } = makeCtx()
    const handlers = createIpcHandlers(ctx)

    const created = await handlers.addModel({
      providerId: "openai" as ProviderId,
      providerModel: "gpt-4o",
    })

    expect(created.providerModel).toBe("gpt-4o")
    expect(created.providerId).toBe("openai")
    expect(String(created.id)).toMatch(/^mdl_/)
    expect(saves).toHaveLength(1)
    expect(saves[0]?.models).toEqual([created])
  })

  it("updateModel replaces the matching route by id, preserving the id", async () => {
    const { ctx, saves } = makeCtx()
    const route = {
      id: "mdl_a" as ModelId,
      providerId: "p_openai" as ProviderId,
      providerModel: "gpt-4o",
    }
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      models: [route],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    const updated = await handlers.updateModel({
      id: "mdl_a" as ModelId,
      input: { providerId: "p_anthropic" as ProviderId, providerModel: "opus" },
    })

    expect(updated).toEqual({
      id: "mdl_a",
      providerId: "p_anthropic",
      providerModel: "opus",
    })
    expect(saves.at(-1)?.models).toEqual([updated])
  })

  it("deleteModel removes the route and returns null", async () => {
    const { ctx, saves } = makeCtx()
    const route = {
      id: "mdl_a" as ModelId,
      providerId: "p_openai" as ProviderId,
      providerModel: "gpt-4o",
    }
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      models: [route],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.deleteModel({ id: "mdl_a" as ModelId })

    expect(result).toBeNull()
    expect(saves.at(-1)?.models).toEqual([])
  })
})

describe("createIpcHandlers.launchHarness", () => {
  it("with a modelId resolves a proxied launch and threads the modelId to the terminal", async () => {
    const { ctx, terminalInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: "stored-run-key",
      proxyPort: 4000,
    })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    // The terminal manager owns session creation; the handler returns only the sessionId.
    expect(result).toEqual({ sessionId: sampleSession.id })
    expect(terminalInputs).toHaveLength(1)
    const input = terminalInputs[0] as {
      harnessId: string
      modelId?: string
      command: string
      env: Record<string, string>
    }
    expect(input.harnessId).toBe("claude")
    // The session is stored against the routed modelId (no alias anymore).
    expect(input.modelId).toBe("mdl_x")
    expect(input.command).toBe("/usr/local/bin/claude")
    // The rendered proxy vars carry the loopback proxy URL + stored per-run key + modelId.
    expect(input.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000")
    expect(input.env.ANTHROPIC_API_KEY).toBe("stored-run-key")
    expect(input.env.ANTHROPIC_MODEL).toBe("mdl_x")
  })

  it("without a modelId launches direct (bypass) with no proxy env and no modelId on the session", async () => {
    const { ctx, terminalInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: "stored-run-key",
      proxyPort: 4000,
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId })

    const input = terminalInputs[0] as Record<string, unknown> & {
      env: Record<string, string>
    }
    // Bypass: the terminal must not carry a modelId ...
    expect("modelId" in input).toBe(false)
    // ... and the direct route renders NO proxy env (the harness uses native creds).
    expect("ANTHROPIC_BASE_URL" in input.env).toBe(false)
    expect("ANTHROPIC_API_KEY" in input.env).toBe(false)
    expect("ANTHROPIC_MODEL" in input.env).toBe(false)
  })

  it("does NOT create a duplicate session directly — the terminal manager owns it", async () => {
    const { ctx, sessionInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    expect(sessionInputs).toEqual([])
  })

  it("falls back to a freshly minted proxy key when none is stored (routed launch)", async () => {
    const { ctx, terminalInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: null,
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    const input = terminalInputs[0] as { env: Record<string, string> }
    expect(input.env.ANTHROPIC_API_KEY).toBe("test-key") // ctx.genProxyKey()
  })

  it("throws so the server surfaces handler-failed when terminal.launch errors", async () => {
    const { ctx } = makeCtx({ providers: [provider()], terminalOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({ id: "claude" as HarnessId }),
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

// ── D.1 Profiles CRUD ─────────────────────────────────────────────────────────

const sampleProfile: Profile = {
  id: "pr_default" as Profile["id"],
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  modelId: "mdl_fast" as ModelId,
  env: {},
}

describe("createIpcHandlers.getProfiles", () => {
  it("returns the profiles from the loaded config when listing", async () => {
    const { ctx } = makeCtx()
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      profiles: [sampleProfile],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getProfiles(undefined)).toEqual([sampleProfile])
  })

  it("returns an empty list when the config has no profiles", async () => {
    const { ctx } = makeCtx()
    const handlers = createIpcHandlers(ctx)
    expect(await handlers.getProfiles(undefined)).toEqual([])
  })
})

describe("createIpcHandlers.addProfile", () => {
  it("mints a pr_-prefixed id and persists the new profile when adding", async () => {
    const original = crypto.randomUUID
    ;(crypto as { randomUUID: () => string }).randomUUID = () => "fixed-uuid"
    try {
      const { ctx, saves } = makeCtx()
      const handlers = createIpcHandlers(ctx)

      const created = await handlers.addProfile({
        name: "Work",
        harnessId: "claude" as Profile["harnessId"],
        modelId: "mdl_fast" as ModelId,
        env: { EXTRA: "1" },
      })

      expect(created.id).toBe("pr_fixed-uuid")
      expect(created.name).toBe("Work")
      expect(created.harnessId).toBe("claude")
      expect(created.modelId).toBe("mdl_fast")
      expect(created.env).toEqual({ EXTRA: "1" })
      expect(saves).toHaveLength(1)
      expect(saves[0]?.profiles).toEqual([created])
    } finally {
      ;(crypto as { randomUUID: () => string }).randomUUID = original
    }
  })

  it("throws so the server surfaces handler-failed when the save fails", async () => {
    const { ctx } = makeCtx()
    ;(ctx.config as { save: unknown }).save = async () =>
      err({ kind: "write-failed" })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.addProfile({
        name: "X",
        harnessId: "claude" as Profile["harnessId"],
        modelId: "mdl_fast" as ModelId,
        env: {},
      }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.updateProfile", () => {
  it("replaces the matching profile and returns the full updated record", async () => {
    const { ctx, saves } = makeCtx()
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      profiles: [sampleProfile],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    const next: Profile = {
      id: sampleProfile.id,
      name: "Renamed",
      harnessId: "codex" as Profile["harnessId"],
      modelId: "mdl_smart" as ModelId,
      env: { TOKEN: "z" },
    }
    const updated = await handlers.updateProfile(next)

    expect(updated).toEqual(next)
    const saved = saves.at(-1)?.profiles.find((p) => p.id === sampleProfile.id)
    expect(saved).toEqual(next)
  })

  it("throws when updateProfile targets an id that does not exist", async () => {
    const { ctx } = makeCtx()
    const handlers = createIpcHandlers(ctx)
    await expect(
      handlers.updateProfile({
        id: "pr_ghost" as Profile["id"],
        name: "X",
        harnessId: "claude" as Profile["harnessId"],
        modelId: "mdl_fast" as ModelId,
        env: {},
      }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.deleteProfile", () => {
  it("removes the profile and returns null on success", async () => {
    const { ctx, saves } = makeCtx()
    await ctx.config.save({
      ...(await ctx.config.load()).value,
      profiles: [sampleProfile],
    } as Config)
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.deleteProfile({ id: sampleProfile.id })

    expect(result).toBeNull()
    expect(saves.at(-1)?.profiles).toEqual([])
  })
})

// ── D.2 pickFolder ─────────────────────────────────────────────────────────────

describe("createIpcHandlers.pickFolder", () => {
  it("returns the first selected path when the dialog resolves a folder", async () => {
    const { ctx, pickFolderCalls } = makeCtx({
      pickFolderResult: ["/Users/me/project"],
    })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.pickFolder({ startingFolder: "/Users/me" })

    expect(result).toEqual({ path: "/Users/me/project" })
    expect(pickFolderCalls).toEqual([{ startingFolder: "/Users/me" }])
  })

  it("returns an empty object when the dialog is cancelled (no selection)", async () => {
    const { ctx } = makeCtx({ pickFolderResult: [] })
    const handlers = createIpcHandlers(ctx)
    expect(await handlers.pickFolder({})).toEqual({})
  })

  it("returns an empty object when params are undefined", async () => {
    const { ctx } = makeCtx({ pickFolderResult: [] })
    const handlers = createIpcHandlers(ctx)
    expect(await handlers.pickFolder(undefined)).toEqual({})
  })
})

// ── D.4 getSessionScrollback ──────────────────────────────────────────────────

describe("createIpcHandlers.getSessionScrollback", () => {
  it("base64-encodes the session's captured bytes into bytesBase64 when reading scrollback", async () => {
    const bytes = new Uint8Array([0, 65, 200, 255])
    const { ctx, readScrollbackIds } = makeCtx({ scrollback: ok(bytes) })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.getSessionScrollback({ id: "s_1" as never })

    expect(result).toEqual({ bytesBase64: bytesToBase64(bytes) })
    expect(readScrollbackIds).toEqual(["s_1"])
  })

  it("throws so the server surfaces handler-failed when the read fails", async () => {
    const { ctx } = makeCtx({ scrollback: err({ kind: "not-found" }) })
    const handlers = createIpcHandlers(ctx)
    await expect(
      handlers.getSessionScrollback({ id: "s_x" as never }),
    ).rejects.toThrow()
  })
})

// ── D.5 launchHarness session metadata + getSessions pagination ───────────────

describe("createIpcHandlers.launchHarness (session metadata)", () => {
  it("threads name, cwd, and extra env into terminal.launch", async () => {
    const { ctx, terminalInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as never,
      modelId: "mdl_x" as ModelId,
      name: "refactor run",
      cwd: "/work/repo",
      env: { EXTRA: "1" },
    })

    const input = terminalInputs[0] as {
      name?: string
      cwd?: string
      env: Record<string, string>
    }
    expect(input.name).toBe("refactor run")
    expect(input.cwd).toBe("/work/repo")
    expect(input.env.EXTRA).toBe("1")
    // Routed launch (modelId present) renders the proxy env.
    expect(input.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000")
  })

  it("omits name/cwd when not supplied (exactOptionalPropertyTypes safe)", async () => {
    const { ctx, terminalInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as never })

    const input = terminalInputs[0] as Record<string, unknown>
    expect("name" in input).toBe(false)
    expect("cwd" in input).toBe(false)
  })

  it("coerces empty/blank name and cwd to omitted (never creates a session named '')", async () => {
    const { ctx, terminalInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as never,
      name: "",
      cwd: "   ",
    })

    const input = terminalInputs[0] as Record<string, unknown>
    expect("name" in input).toBe(false)
    expect("cwd" in input).toBe(false)
  })
})

// ── D.6 listProviderModels ────────────────────────────────────────────────────

describe("createIpcHandlers.listProviderModels", () => {
  it("returns { models } when ctx.listProviderModels resolves ok", async () => {
    const { ctx } = makeCtx()
    ;(ctx as { listProviderModels: unknown }).listProviderModels = async () =>
      ok(["gpt-4o", "gpt-4o-mini"])
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.listProviderModels({
      providerId: "p_openai" as never,
    })

    expect(result).toEqual({ models: ["gpt-4o", "gpt-4o-mini"] })
  })

  it("throws so the server surfaces handler-failed when ctx.listProviderModels returns err", async () => {
    const { ctx } = makeCtx()
    ;(ctx as { listProviderModels: unknown }).listProviderModels = async () =>
      err({ kind: "unknown-provider", providerId: "p_ghost" })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.listProviderModels({ providerId: "p_ghost" as never }),
    ).rejects.toThrow()
  })

  it("passes the providerId string to ctx.listProviderModels", async () => {
    const calls: string[] = []
    const { ctx } = makeCtx()
    ;(ctx as { listProviderModels: unknown }).listProviderModels = async (
      id: string,
    ) => {
      calls.push(id)
      return ok(["llama3"])
    }
    const handlers = createIpcHandlers(ctx)

    await handlers.listProviderModels({ providerId: "p_ollama" as never })

    expect(calls).toEqual(["p_ollama"])
  })
})

describe("createIpcHandlers.getSessions (running + pagination)", () => {
  it("passes running, limit, and offset through to sessions.query", async () => {
    const queries: unknown[] = []
    const { ctx } = makeCtx()
    ;(ctx.sessions as { query: unknown }).query = (filter: unknown) => {
      queries.push(filter)
      return ok([sampleSession])
    }
    const handlers = createIpcHandlers(ctx)

    await handlers.getSessions({ running: true, limit: 20, offset: 40 })

    expect(queries[0]).toEqual({ running: true, limit: 20, offset: 40 })
  })

  it("drops undefined keys from the filter", async () => {
    const queries: unknown[] = []
    const { ctx } = makeCtx()
    ;(ctx.sessions as { query: unknown }).query = (filter: unknown) => {
      queries.push(filter)
      return ok([])
    }
    const handlers = createIpcHandlers(ctx)

    await handlers.getSessions({ running: undefined })

    expect(queries[0]).toEqual({})
  })
})
