import { describe, expect, it } from "bun:test"
import type { StoredEvent } from "@launchkit/agent-events"
import type { Config } from "@launchkit/config"
import {
  createFakeCommandResolver,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
import type {
  HarnessId,
  ModelId,
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

const baseConfig = (
  providers: readonly Provider[],
  lastSelectedFolder = "",
  lastSelectedHarnessId = "",
  lastSelectedModelId = "",
): Config =>
  ({
    version: 2,
    providers,
    models: [],
    settings: {
      proxyPort: 4000,
      proxyHost: "127.0.0.1",
      lastSelectedFolder,
      lastSelectedHarnessId,
      lastSelectedModelId,
    },
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
    runnerOk?: boolean
    proxyKeyStored?: string | null
    pickFolderResult?: readonly string[]
    lastSelectedFolder?: string
    lastSelectedHarnessId?: string
    lastSelectedModelId?: string
    runEvents?: Result<
      readonly StoredEvent[],
      { readonly kind: "db-failed"; readonly detail: string }
    >
    nativeHarnessId?: string
  } = {},
): {
  ctx: AppContext
  saves: Config[]
  secretSets: string[]
  launchParams: unknown[]
  sessionInputs: unknown[]
  pickFolderCalls: unknown[]
  runnerLaunchInputs: unknown[]
  runEventsIds: string[]
} => {
  const saves: Config[] = []
  const secretSets: string[] = []
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  const pickFolderCalls: unknown[] = []
  const runnerLaunchInputs: unknown[] = []
  const runEventsIds: string[] = []
  let current = baseConfig(
    over.providers ?? [provider()],
    over.lastSelectedFolder ?? "",
    over.lastSelectedHarnessId ?? "",
    over.lastSelectedModelId ?? "",
  )

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
    runner: {
      launch: (input: unknown) => {
        runnerLaunchInputs.push(input)
        return over.runnerOk === false
          ? err({ kind: "start-failed", detail: "no driver" })
          : ok({ sessionId: sampleSession.id })
      },
      handleInbound: () => undefined,
      bindSend: () => undefined,
    },
    runnerSocketUrl: "ws://localhost:23456/",
    runEvents: {
      read: (id: unknown) => {
        runEventsIds.push(id as string)
        return (
          over.runEvents ??
          ok([
            {
              seq: 0,
              sessionId: sampleSession.id,
              ts: "2026-06-08T12:00:00.000Z",
              event: { type: "runner-started", runnerId: "r_root" },
            },
          ])
        )
      },
    },
    driverRegistry: {
      get: () => undefined,
      isNative: (harnessId: unknown) =>
        String(harnessId) === (over.nativeHarnessId ?? "claude"),
    },
  } as unknown as AppContext

  return {
    ctx,
    saves,
    secretSets,
    launchParams,
    sessionInputs,
    pickFolderCalls,
    runnerLaunchInputs,
    runEventsIds,
  }
}

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

describe("createIpcHandlers.addProvider", () => {
  it("falls back to the sdkProvider name when no name is given", async () => {
    const { ctx, saves } = makeCtx({ providers: [] })
    const handlers = createIpcHandlers(ctx)

    const view = await handlers.addProvider({
      sdkProvider: "anthropic",
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })

    expect(view.name).toBe("anthropic")
    const savedProviders = saves.at(-1)?.providers ?? []
    expect(savedProviders.at(-1)?.name).toBe("anthropic")
  })

  it("falls back to the sdkProvider name when the name is blank/whitespace", async () => {
    const { ctx } = makeCtx({ providers: [] })
    const handlers = createIpcHandlers(ctx)

    const view = await handlers.addProvider({
      name: "   ",
      sdkProvider: "groq",
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })

    expect(view.name).toBe("groq")
  })

  it("keeps the provided name when one is given", async () => {
    const { ctx } = makeCtx({ providers: [] })
    const handlers = createIpcHandlers(ctx)

    const view = await handlers.addProvider({
      name: "My OpenAI",
      sdkProvider: "openai",
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })

    expect(view.name).toBe("My OpenAI")
  })
})

describe("createIpcHandlers.updateProvider", () => {
  it("falls back to the sdkProvider name when updating with a blank name", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    const view = await handlers.updateProvider({
      id: provider().id,
      input: {
        name: "   ",
        sdkProvider: "anthropic",
        config: {},
        secretFieldNames: ["apiKey"],
        models: [],
      },
    })

    expect(view.name).toBe("anthropic")
    const savedProviders = saves.at(-1)?.providers ?? []
    expect(savedProviders.at(-1)?.name).toBe("anthropic")
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
  it("with a modelId resolves a proxied launch and threads the modelId to the runner", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: "stored-run-key",
      proxyPort: 4000,
    })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    // The run manager owns session creation; the handler returns only the sessionId.
    expect(result).toEqual({ sessionId: sampleSession.id })
    expect(runnerLaunchInputs).toHaveLength(1)
    const input = runnerLaunchInputs[0] as {
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
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: "stored-run-key",
      proxyPort: 4000,
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId })

    const input = runnerLaunchInputs[0] as Record<string, unknown> & {
      env: Record<string, string>
    }
    // Bypass: the runner must not carry a modelId ...
    expect("modelId" in input).toBe(false)
    // ... and the direct route renders NO proxy env (the harness uses native creds).
    expect("ANTHROPIC_BASE_URL" in input.env).toBe(false)
    expect("ANTHROPIC_API_KEY" in input.env).toBe(false)
    expect("ANTHROPIC_MODEL" in input.env).toBe(false)
  })

  it("does NOT create a duplicate session directly — the run manager owns it", async () => {
    const { ctx, sessionInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    expect(sessionInputs).toEqual([])
  })

  it("falls back to a freshly minted proxy key when none is stored (routed launch)", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      proxyKeyStored: null,
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_x" as ModelId,
    })

    const input = runnerLaunchInputs[0] as { env: Record<string, string> }
    expect(input.env.ANTHROPIC_API_KEY).toBe("test-key") // ctx.genProxyKey()
  })

  it("throws so the server surfaces handler-failed when the harness has no native driver", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      nativeHarnessId: "__none__",
    })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({ id: "claude" as HarnessId }),
    ).rejects.toThrow()
    expect(runnerLaunchInputs).toHaveLength(0)
  })

  it("throws so the server surfaces handler-failed when runner.launch errors", async () => {
    const { ctx } = makeCtx({ providers: [provider()], runnerOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({ id: "claude" as HarnessId }),
    ).rejects.toThrow()
  })

  it("persists the launched cwd as settings.lastSelectedFolder on a successful launch", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      name: "x",
      cwd: "/home/me/proj",
      env: {},
    })

    expect(saves.at(-1)?.settings.lastSelectedFolder).toBe("/home/me/proj")
  })

  it("keeps the prior lastSelectedFolder when cwd is blank but still persists harness/model", async () => {
    const { ctx, saves } = makeCtx({
      providers: [provider()],
      lastSelectedFolder: "/home/me/prior",
    })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_1" as ModelId,
      name: "x",
      cwd: "   ",
      env: {},
    })

    // A save STILL happens — harness/model persist on every success ...
    const saved = saves.at(-1)
    expect(saved?.settings.lastSelectedHarnessId).toBe("claude")
    expect(saved?.settings.lastSelectedModelId).toBe("mdl_1")
    // ... but the folder is unchanged (blank cwd never overwrites the prior value).
    expect(saved?.settings.lastSelectedFolder).toBe("/home/me/prior")
  })

  it("persists the launched harness and model on a successful launch", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as HarnessId,
      modelId: "mdl_1" as ModelId,
      env: {},
    })

    const saved = saves.at(-1)
    expect(saved?.settings.lastSelectedHarnessId).toBe("claude")
    expect(saved?.settings.lastSelectedModelId).toBe("mdl_1")
  })

  it("persists harness and an empty model on a default (no-model) launch", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId, env: {} })

    const saved = saves.at(-1)
    expect(saved?.settings.lastSelectedHarnessId).toBe("claude")
    expect(saved?.settings.lastSelectedModelId).toBe("")
  })

  it("persists harness/model even when no cwd is provided", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId, env: {} })

    expect(saves.at(-1)).toBeDefined()
    expect(saves.at(-1)?.settings.lastSelectedHarnessId).toBe("claude")
  })

  it("does not persist harness/model when the launch fails", async () => {
    const { ctx, saves } = makeCtx({
      providers: [provider()],
      runnerOk: false,
    })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({ id: "claude" as HarnessId, env: {} }),
    ).rejects.toThrow()

    expect(saves).toHaveLength(0)
  })

  it("does not persist lastSelectedFolder when the launch fails", async () => {
    const { ctx, saves } = makeCtx({
      providers: [provider()],
      runnerOk: false,
    })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.launchHarness({
        id: "claude" as HarnessId,
        name: "x",
        cwd: "/home/me/proj",
        env: {},
      }),
    ).rejects.toThrow()

    expect(saves).toHaveLength(0)
  })
})

describe("createIpcHandlers.getHarnesses", () => {
  it("getHarnesses sets native from the driver registry", async () => {
    const { ctx } = makeCtx({ nativeHarnessId: "claude" })
    const handlers = createIpcHandlers(ctx)
    const harnesses = await handlers.getHarnesses(undefined)
    expect(harnesses.find((h) => h.id === "claude")?.native).toBe(true)
  })

  it("getHarnesses sets native=false for harnesses with no registered driver", async () => {
    const { ctx } = makeCtx({ nativeHarnessId: "__none__" })
    const handlers = createIpcHandlers(ctx)
    const harnesses = await handlers.getHarnesses(undefined)
    expect(harnesses.every((h) => h.native === false)).toBe(true)
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

describe("createIpcHandlers.getSettings", () => {
  it("returns all three persisted fields from the loaded config", async () => {
    const { ctx } = makeCtx({
      lastSelectedFolder: "/home/me/last",
      lastSelectedHarnessId: "claude",
      lastSelectedModelId: "mdl_x",
    })
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getSettings(undefined)).toEqual({
      lastSelectedFolder: "/home/me/last",
      lastSelectedHarnessId: "claude",
      lastSelectedModelId: "mdl_x",
    })
  })

  it("returns empty strings when nothing has been persisted", async () => {
    const { ctx } = makeCtx()
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getSettings(undefined)).toEqual({
      lastSelectedFolder: "",
      lastSelectedHarnessId: "",
      lastSelectedModelId: "",
    })
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

// ── D.5 launchHarness session metadata + getSessions pagination ───────────────

describe("createIpcHandlers.launchHarness (session metadata)", () => {
  it("threads name, cwd, and extra env into runner.launch", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as never,
      modelId: "mdl_x" as ModelId,
      name: "refactor run",
      cwd: "/work/repo",
      env: { EXTRA: "1" },
    })

    const input = runnerLaunchInputs[0] as {
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

  it("omits name when not supplied (exactOptionalPropertyTypes safe)", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as never })

    const input = runnerLaunchInputs[0] as Record<string, unknown>
    expect("name" in input).toBe(false)
    // The runner always receives a cwd (defaulting to "" when none was given).
    expect(input.cwd).toBe("")
  })

  it("coerces empty/blank name and cwd to omitted (never creates a session named '')", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({
      id: "claude" as never,
      name: "",
      cwd: "   ",
    })

    const input = runnerLaunchInputs[0] as Record<string, unknown>
    expect("name" in input).toBe(false)
    // A blank cwd is coerced to "" (never a whitespace path).
    expect(input.cwd).toBe("")
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

describe("createIpcHandlers.getRunnerSocketUrl", () => {
  it("returns the runner socket url from the context", async () => {
    const { ctx } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)
    const result = await handlers.getRunnerSocketUrl()
    expect(result).toEqual({ url: "ws://localhost:23456/" })
  })
})

describe("createIpcHandlers.getRunEvents", () => {
  it("returns the stored events for the requested session", async () => {
    const { ctx, runEventsIds } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)
    const result = await handlers.getRunEvents({ id: "s_1" as never })
    expect(result.events[0]?.event.type).toBe("runner-started")
    expect(runEventsIds).toEqual(["s_1"])
  })

  it("throws so the server surfaces handler-failed when the read fails", async () => {
    const { ctx } = makeCtx({
      providers: [provider()],
      runEvents: err({ kind: "db-failed", detail: "boom" }),
    })
    const handlers = createIpcHandlers(ctx)
    await expect(
      handlers.getRunEvents({ id: "s_x" as never }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.updateHarnessPrefs", () => {
  it("persists the mode into settings.lastByHarness for the harness", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    const result = await handlers.updateHarnessPrefs({
      harnessId: "claude" as HarnessId,
      mode: "plan",
    })

    expect(result).toBeNull()
    expect(saves.at(-1)?.settings.lastByHarness).toEqual({
      claude: { mode: "plan" },
    })
  })

  it("merges into existing entries without dropping other harnesses", async () => {
    const { ctx, saves } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.updateHarnessPrefs({
      harnessId: "codex" as HarnessId,
      mode: "bypass",
    })
    await handlers.updateHarnessPrefs({
      harnessId: "claude" as HarnessId,
      mode: "plan",
    })

    expect(saves.at(-1)?.settings.lastByHarness).toEqual({
      codex: { mode: "bypass" },
      claude: { mode: "plan" },
    })
  })
})

describe("createIpcHandlers.launchHarness (persisted mode)", () => {
  it("forwards the persisted permission mode for the harness to runner.launch", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({ providers: [provider()] })
    const loaded = (await ctx.config.load()).value
    await ctx.config.save({
      ...loaded,
      settings: {
        ...loaded.settings,
        lastByHarness: { claude: { mode: "plan" } },
      },
    } as Config)
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId, env: {} })

    const input = runnerLaunchInputs[0] as { permissionMode?: string }
    expect(input.permissionMode).toBe("plan")
  })

  it("omits permissionMode when nothing is stored for the harness", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await handlers.launchHarness({ id: "claude" as HarnessId, env: {} })

    const input = runnerLaunchInputs[0] as Record<string, unknown>
    expect("permissionMode" in input).toBe(false)
  })
})

describe("createIpcHandlers.launchHarness selection", () => {
  it("launches a native harness via the runner manager", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      nativeHarnessId: "claude",
    })
    const handlers = createIpcHandlers(ctx)
    const result = await handlers.launchHarness({ id: "claude" as never })
    expect(result).toEqual({ sessionId: sampleSession.id })
    expect(runnerLaunchInputs).toHaveLength(1)
    // The resolved claude executable is forwarded so the SDK driver spawns it directly (its own
    // bundle-relative resolution finds no cli.js in the packaged app).
    expect(runnerLaunchInputs[0]).toMatchObject({
      command: "/usr/local/bin/claude",
    })
    // The resolved launch args are forwarded too (codex needs them for proxy routing; env-routed
    // harnesses ignore them).
    expect(runnerLaunchInputs[0]).toHaveProperty("args")
  })

  it("rejects a harness with no native driver instead of launching", async () => {
    const { ctx, runnerLaunchInputs } = makeCtx({
      providers: [provider()],
      nativeHarnessId: "__none__",
    })
    const handlers = createIpcHandlers(ctx)
    await expect(
      handlers.launchHarness({ id: "claude" as never }),
    ).rejects.toThrow()
    expect(runnerLaunchInputs).toHaveLength(0)
  })
})
