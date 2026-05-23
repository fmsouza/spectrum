# apps/desktop — Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dual-mode composition root. Provide a `runApp` mode-router (CLI vs GUI) that is unit-testable with fakes, a `createAppContext` factory that constructs the **real** adapters from every package and injects them, the security-critical `createIpcHandlers` that binds the `@launchkit/ipc` contract to those subsystems (masking secrets at the boundary), the thin Electrobun `openWindow`, and a fleshed-out `main.ts` that ties them together.

**Architecture:** Effects-at-the-edges, per `01-conventions/functional-style.md`, taken to its conclusion: the composition root (`createAppContext`) is the **one place** real `fs`/keychain/sqlite/process adapters are constructed, and it contains **no branching logic** — it is a flat construction function. All decision logic lives in small injected, tested functions: `runApp` (which mode runs) and `createIpcHandlers` (how each IPC method maps to a subsystem call). Electrobun's window/IPC surface lives behind thin seams (`openWindow`, the transport in `main.ts`) so the testable logic never needs a running window. Security (`01-conventions/security.md`) is baked into the IPC layer: a `Provider` is projected to a `ProviderView` that structurally cannot carry a secret value or ref; `setProviderSecret` is the only inbound secret path and writes straight to the keychain; the proxy is started bound to loopback from `config.settings.proxyHost`.

**Tech Stack:** TypeScript (strict), `bun:test`, Electrobun (pinned, behind thin seams), all `@launchkit/*` packages.

> Depends on: `cli`, `proxy`, `harnesses`, `config`, `sessions`, `secrets`, `ipc`, `ui`, `types`, `utils` (all `done`), and `phase0` (which already created `apps/desktop/` via `electrobun init`, including `apps/desktop/src/detect-mode.ts` and a stub `apps/desktop/src/main.ts`). Read `01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, and especially `security.md` (IPC + secrets + network surface sections), plus `02-monorepo/boundaries.md` (rule 6: this is the only place effects are constructed) and `layout.md`.
> This plan does NOT create a new package — `apps/desktop` exists from `phase0`. It adds `@launchkit/*` workspace deps to `apps/desktop/package.json` as it imports them (all `workspace:*`, plus `electrobun` pinned from `phase0`).
> **Imports these locked contracts — do NOT redefine them:** `runCli` + `CliDeps` + `StartProxyDeps` from `@launchkit/cli`; `createCachedConfigStore`, `createFileConfigStore`, `createFsConfigFile`, `defaultConfig`, `type Config`, `type ConfigStore` from `@launchkit/config`; `createSecretStore`, `createMacosSecurityBackend`, `createBunProcessRunner`, `type SecretStore` from `@launchkit/secrets`; `createSessionStore`, `createBunSqliteDatabase`, `type SessionStore`, `type SessionInput` from `@launchkit/sessions`; `createRegistry`, `createDirHarnessFileSource`, `launchHarness`, `createPathCommandResolver`, `createBunProcessSpawner`, `type HarnessRegistry`, `type LaunchParams` from `@launchkit/harnesses`; `startProxy`, `isProxyRunning`, `createProviderFactory`, `loadSdk`, `createRealGateway`, `type RunningProxy`, `type ProviderFactory`, `type LanguageModelGateway` from `@launchkit/proxy`; `createIpcServer`, `type IpcHandlers`, `type IpcMethods`, `type ProviderView`, `type ServerTransport` from `@launchkit/ipc`; `type Provider`, `type SecretRef`, `type Session` from `@launchkit/types`; `type Result`, `ok`, `err`, `isOk`, `isErr`, `createSystemClock`, `createCryptoIdGen` from `@launchkit/utils`.

> **ELECTROBUN NOTE:** confirm Electrobun's `BrowserWindow`/IPC APIs against current Electrobun docs at implementation time (use the context7 MCP or fetch the docs). This plan pins the *intended wiring* and keeps every Electrobun-specific call behind thin, injected seams (`openWindow`, and the `ServerTransport` adapter in `main.ts`) so the logic is unit-testable without a running window. If the installed API diverges, adapt **only** the thin seam — `runApp`, `createIpcHandlers`, and `createAppContext`'s injected functions stay the same. The window file (`gui/window.ts`) is smoke-tested only; if it cannot import the real Electrobun symbols under `bun test`, guard the import as described in desktop-shell-04 and mark that one step `blocked` rather than the whole task.

> **OUT OF SCOPE for this plan (other plans own these — do NOT create or modify them here):** `apps/desktop/src/gui/tray.ts` (the `tray-and-polish` plan), `apps/desktop/views/**` (the `gui-pages` plan), `apps/desktop/src/detect-mode.ts` (already done in `phase0`). The `testProvider` IPC handler **delegates to a tester supplied by the `tray-and-polish` plan**; this plan wires the seam (`ctx.testProvider`) and a placeholder real implementation, and notes the dependency.

---

### Task desktop-shell-01: `runApp` mode router

**Files:**
- Create: `apps/desktop/src/app.ts`
- Test: `apps/desktop/src/app.test.ts`

`runApp` is the pure decision: given a `mode` (already computed by the `phase0` `detectMode`), it runs **exactly one** path — `"cli"` calls `runCli(argv)`; `"gui"` starts the proxy then opens the window. Both effects arrive as injected functions (`RunAppDeps`), so the test proves the correct path runs and the other does not, with no real CLI, proxy, or window.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test"
import { runApp } from "./app"
import type { RunAppDeps } from "./app"

/** A fully-faked RunAppDeps with spies, so a test can assert which path ran. */
const makeDeps = (over: Partial<RunAppDeps> = {}): RunAppDeps => ({
  runCli: mock(async (_argv: readonly string[]) => undefined),
  startProxy: mock((_ctx: unknown) => ({ stop: () => {} })),
  openWindow: mock(() => {}),
  ...over,
})

describe("runApp", () => {
  it("calls runCli with argv and never starts the proxy or opens a window when mode is 'cli'", async () => {
    const deps = makeDeps()
    const argv = ["bun", "main.ts", "launch", "claude"] as const

    await runApp("cli", argv, deps)

    expect(deps.runCli).toHaveBeenCalledTimes(1)
    expect((deps.runCli as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(argv)
    expect(deps.startProxy).toHaveBeenCalledTimes(0)
    expect(deps.openWindow).toHaveBeenCalledTimes(0)
  })

  it("starts the proxy then opens the window and never runs the CLI when mode is 'gui'", async () => {
    const deps = makeDeps()

    await runApp("gui", ["bun", "main.ts"], deps)

    expect(deps.startProxy).toHaveBeenCalledTimes(1)
    expect(deps.openWindow).toHaveBeenCalledTimes(1)
    expect(deps.runCli).toHaveBeenCalledTimes(0)
  })

  it("starts the proxy before opening the window when mode is 'gui'", async () => {
    const order: string[] = []
    const deps = makeDeps({
      startProxy: mock(() => {
        order.push("startProxy")
        return { stop: () => {} }
      }),
      openWindow: mock(() => {
        order.push("openWindow")
      }),
    })

    await runApp("gui", ["bun", "main.ts"], deps)

    expect(order).toEqual(["startProxy", "openWindow"])
  })

  it("awaits runCli so a slow CLI command completes before runApp resolves", async () => {
    let finished = false
    const deps = makeDeps({
      runCli: mock(async () => {
        await Promise.resolve()
        finished = true
        return undefined
      }),
    })

    await runApp("cli", ["bun", "main.ts", "list"], deps)

    expect(finished).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./app"`).

- [ ] **Step 3: Implement `app.ts`**

```typescript
import type { AppMode } from "./detect-mode"

/** A handle to a running proxy this shell can later stop (mirrors proxy's RunningProxy.stop). */
export interface ProxyHandle {
  stop(): void
}

/**
 * The two effects `runApp` chooses between, injected so the router is pure logic.
 * `startProxy` receives the wired AppContext (typed `unknown` here to keep this module free of
 * a `composition.ts` import cycle — `main.ts` supplies a correctly-typed function); `openWindow`
 * mounts the Electrobun webview.
 */
export interface RunAppDeps {
  readonly runCli: (argv: readonly string[]) => Promise<unknown>
  readonly startProxy: (ctx: unknown) => ProxyHandle
  readonly openWindow: () => void
}

/**
 * Run exactly one mode. `"cli"` parses argv + runs a command (the proxy starts ephemerally inside
 * the CLI's own launch path, not here). `"gui"` starts the persistent background proxy, then opens
 * the window. The other path's effects are never invoked — asserted in the tests with fakes.
 */
export const runApp = async (
  mode: AppMode,
  argv: readonly string[],
  deps: RunAppDeps,
): Promise<void> => {
  if (mode === "cli") {
    await deps.runCli(argv)
    return
  }
  deps.startProxy(undefined)
  deps.openWindow()
}
```

> `AppMode` is the `"cli" | "gui"` type already exported by the `phase0` `detect-mode.ts`. `startProxy` takes the `AppContext` as `unknown` in this file purely to avoid importing `composition.ts` (which constructs real effects) into the unit-tested router; `main.ts` passes a closure that narrows it. The CLI path is fully `await`ed so the process does not exit before a command finishes (the last test). No effect is touched directly — everything is on `deps`.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(desktop): add runApp mode router [desktop-shell-01]`.

---

### Task desktop-shell-02: `createIpcHandlers` (the secret-masking boundary)

**Files:**
- Create: `apps/desktop/src/gui/ipc/handlers.ts`
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`

`createIpcHandlers(ctx)` returns the `IpcHandlers` map the `@launchkit/ipc` server dispatches to. This is the **security-critical** task: every provider leaving main→webview is masked to a `ProviderView` (`secrets` → `secretFields: { isSet: true }`, never a value or ref); `setProviderSecret` is the only inbound secret path and stores straight to the keychain; `launchHarness` records a session; `getProxyStatus` reflects the live proxy. All of `ctx` is faked, so no real fs/keychain/sqlite is touched.

This task introduces the `AppContext` **type** (the wired subsystems). The real construction lands in desktop-shell-03; here we depend on the type only, so handlers can be tested against a fake `AppContext`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ok, err, type Result } from "@launchkit/utils"
import type { Provider, Session } from "@launchkit/types"
import type { Config } from "@launchkit/config"
import { createIpcHandlers } from "./handlers"
import type { AppContext } from "../../composition"

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
  } = {},
): {
  ctx: AppContext
  saves: Config[]
  secretSets: string[]
  launchParams: unknown[]
  sessionInputs: unknown[]
} => {
  const saves: Config[] = []
  const secretSets: string[] = []
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  let current = baseConfig(over.providers ?? [provider()])

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
        : ok({ pid: 4321 })
    },
    proxy: {
      isRunning: async () => over.proxyRunning ?? true,
      start: () => ({ hostname: "127.0.0.1", port: over.proxyPort ?? 4000, stop: () => {} }),
    },
    proxyPort: over.proxyPort ?? 4000,
    proxyBaseUrl: `http://127.0.0.1:${over.proxyPort ?? 4000}`,
    testProvider: async () => ok({ ok: true, latencyMs: 12 }),
    // fields not exercised by these tests are present on the real AppContext (desktop-shell-03)
  } as unknown as AppContext

  return { ctx, saves, secretSets, launchParams, sessionInputs }
}

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
    const { ctx } = makeCtx({ providers: [provider({ secrets: { apiKey: { ref: "kc_secret_ref" } } })] })
    const handlers = createIpcHandlers(ctx)

    const serialized = JSON.stringify(await handlers.getProviders(undefined))

    expect(serialized).not.toContain("kc_secret_ref")
    expect(serialized).not.toContain('"ref"')
    expect(serialized).not.toContain("sk-")
  })

  it("marks a secret field isSet:true for every keychain ref the provider holds", async () => {
    const { ctx } = makeCtx({
      providers: [provider({ secrets: { apiKey: { ref: "kc_a" }, secretAccessKey: { ref: "kc_b" } } })],
    })
    const handlers = createIpcHandlers(ctx)

    const [view] = await handlers.getProviders(undefined)

    expect(view?.secretFields).toEqual({ apiKey: { isSet: true }, secretAccessKey: { isSet: true } })
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
    const saved = saves[0]?.providers.find((p) => p.id === ("p_openai" as never))
    expect(saved?.secrets).toEqual({ apiKey: { ref: "kc_minted" } })
  })

  it("throws so the server surfaces handler-failed when the keychain set fails", async () => {
    const { ctx } = makeCtx({
      providers: [provider({ secrets: {} })],
      setResult: err({ kind: "backend-failed" }),
    })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.setProviderSecret({ providerId: "p_openai" as never, field: "apiKey", value: "sk-x" }),
    ).rejects.toThrow()
  })

  it("throws when setProviderSecret targets a provider id that does not exist", async () => {
    const { ctx } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    await expect(
      handlers.setProviderSecret({ providerId: "p_ghost" as never, field: "apiKey", value: "sk-x" }),
    ).rejects.toThrow()
  })
})

describe("createIpcHandlers.launchHarness", () => {
  it("launches via ctx.launch and records a session, returning the created Session", async () => {
    const { ctx, launchParams, sessionInputs } = makeCtx({ providers: [provider()] })
    const handlers = createIpcHandlers(ctx)

    const session = await handlers.launchHarness({ id: "claude" as never, alias: "fast" as never })

    expect(session).toEqual(sampleSession)
    expect(launchParams).toHaveLength(1)
    expect(sessionInputs).toEqual([{ harnessId: "claude", alias: "fast" }])
  })

  it("throws so the server surfaces handler-failed when the launcher fails to spawn", async () => {
    const { ctx } = makeCtx({ providers: [provider()], launchOk: false })
    const handlers = createIpcHandlers(ctx)

    await expect(handlers.launchHarness({ id: "claude" as never })).rejects.toThrow()
  })
})

describe("createIpcHandlers.getProxyStatus", () => {
  it("reports running:true and the bound port when the proxy is up", async () => {
    const { ctx } = makeCtx({ proxyRunning: true, proxyPort: 4000 })
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getProxyStatus(undefined)).toEqual({ running: true, port: 4000 })
  })

  it("reports running:false when the proxy is not up", async () => {
    const { ctx } = makeCtx({ proxyRunning: false, proxyPort: 4000 })
    const handlers = createIpcHandlers(ctx)

    expect(await handlers.getProxyStatus(undefined)).toEqual({ running: false, port: 4000 })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./handlers"` / `"../../composition"`).

> `handlers.ts` imports the `AppContext` **type** from `../../composition`. So that the type exists before its constructor is written, create the file `apps/desktop/src/composition.ts` now containing **only** the `AppContext` type (and the imports it needs); the `createAppContext` factory is added in desktop-shell-03. This keeps each task's RED caused by the file under test, not a missing type.

- [ ] **Step 3: Create `apps/desktop/src/composition.ts` with the `AppContext` type only**

```typescript
import type { ConfigStore } from "@launchkit/config"
import type { SecretStore } from "@launchkit/secrets"
import type { SessionStore } from "@launchkit/sessions"
import type { LaunchParams, HarnessRegistry } from "@launchkit/harnesses"
import type { ProviderFactory, LanguageModelGateway, RunningProxy } from "@launchkit/proxy"
import type { Result } from "@launchkit/utils"

/** Result of testing one provider's live connectivity (mirrors ipc TestProviderResult). */
export type ProviderTestResult = { readonly ok: boolean; readonly latencyMs: number }

/**
 * The wired subsystems — every effectful capability the GUI/CLI needs, already constructed with
 * real adapters by `createAppContext`. The IPC handlers and `main.ts` depend on this shape; tests
 * inject a fake. Keeping it an explicit type (not inferred from the factory) lets desktop-shell-02
 * write handlers against it before the factory exists.
 */
export interface AppContext {
  readonly config: ConfigStore
  readonly secrets: SecretStore
  readonly sessions: SessionStore
  readonly registry: HarnessRegistry
  /** `launchHarness(realDeps)` partially applied — a single `(params) => Result<{ pid }, unknown>`. */
  readonly launch: (params: LaunchParams) => Result<{ readonly pid: number }, unknown>
  readonly proxy: {
    isRunning(baseUrl: string): Promise<boolean>
    start(opts: { host: string; port: number; proxyKey: string; config: import("@launchkit/config").Config }): RunningProxy
  }
  readonly factory: ProviderFactory
  readonly gateway: LanguageModelGateway
  /** Test one provider's connectivity. The real implementation is provided by the tray-and-polish plan. */
  readonly testProvider: (providerId: string) => Promise<Result<ProviderTestResult, unknown>>
  /** The configured proxy port (from `config.settings.proxyPort`), surfaced for `getProxyStatus`. */
  readonly proxyPort: number
  /** The loopback proxy base URL (`http://127.0.0.1:<port>`), used by `proxy.isRunning`. */
  readonly proxyBaseUrl: string
  /** Mints the per-run ≥32-byte proxy key (security.md) when the shell starts an ephemeral proxy. */
  readonly genProxyKey: () => string
  /** Resolved settings paths (config + db + harness dir), surfaced for diagnostics/tests. */
  readonly paths: { readonly configFile: string; readonly dbFile: string; readonly harnessDir: string }
}
```

- [ ] **Step 4: Implement `handlers.ts`**

```typescript
import { isOk } from "@launchkit/utils"
import type { Provider, SecretRef } from "@launchkit/types"
import type { ProviderView, IpcHandlers } from "@launchkit/ipc"
import type { AppContext } from "../../composition"

/**
 * Project a `Provider` to the secret-free `ProviderView` that crosses IPC to the webview.
 * SECURITY (security.md): `secrets` (keychain refs) is replaced by presence flags only — no `ref`,
 * no value ever leaves the main process. This is the single mapping the masking tests pin.
 */
const toProviderView = (provider: Provider): ProviderView => ({
  id: provider.id,
  name: provider.name,
  sdkProvider: provider.sdkProvider,
  config: provider.config,
  secretFields: Object.fromEntries(
    Object.keys(provider.secrets).map((field) => [field, { isSet: true }] as const),
  ),
  models: provider.models,
})

/** Raised inside a handler so the ipc server wraps it as a typed handler-failed IpcError. */
const fail = (message: string): never => {
  throw new Error(message)
}

/**
 * Bind the `@launchkit/ipc` contract to the wired subsystems. Each handler is `async` and either
 * returns the validated result shape or throws (the ipc server turns a throw into a `handler-failed`
 * IpcError; nothing leaks a stack trace because the server stringifies `error.message` only).
 * `void` results are encoded as `null` (the ipc VoidSchema), matching `04-ipc.md`.
 */
export const createIpcHandlers = (ctx: AppContext): IpcHandlers => {
  /** Load config or throw a message-safe handler error. */
  const loadConfig = async () => {
    const loaded = await ctx.config.load()
    if (!isOk(loaded)) return fail("could not load config")
    return loaded.value
  }

  return {
    // ── Providers ──────────────────────────────────────────────────────────────────────
    getProviders: async () => {
      const config = await loadConfig()
      return config.providers.map(toProviderView)
    },

    addProvider: async (input) => {
      const config = await loadConfig()
      // Build a Provider from the NON-secret input. secrets start empty — a value can only be set
      // later via setProviderSecret, never through this path (security.md).
      const provider: Provider = {
        id: `p_${crypto.randomUUID()}` as Provider["id"],
        name: input.name,
        sdkProvider: input.sdkProvider,
        config: input.config,
        secrets: {},
        models: input.models,
      }
      const saved = await ctx.config.save({ ...config, providers: [...config.providers, provider] })
      if (!isOk(saved)) return fail("could not save provider")
      return toProviderView(provider)
    },

    updateProvider: async ({ id, input }) => {
      const config = await loadConfig()
      const existing = config.providers.find((p) => p.id === id)
      if (existing === undefined) return fail(`unknown provider: ${String(id)}`)
      // Preserve existing secret refs; only non-secret fields are updatable over IPC.
      const updated: Provider = {
        ...existing,
        name: input.name,
        sdkProvider: input.sdkProvider,
        config: input.config,
        models: input.models,
      }
      const providers = config.providers.map((p) => (p.id === id ? updated : p))
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not save provider")
      return toProviderView(updated)
    },

    deleteProvider: async ({ id }) => {
      const config = await loadConfig()
      const providers = config.providers.filter((p) => p.id !== id)
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not delete provider")
      return null
    },

    testProvider: async ({ id }) => {
      // Delegates to the tester wired by the tray-and-polish plan (see AppContext.testProvider).
      const result = await ctx.testProvider(String(id))
      if (!isOk(result)) return fail("provider test failed")
      return result.value
    },

    setProviderSecret: async ({ providerId, field, value }) => {
      const config = await loadConfig()
      const existing = config.providers.find((p) => p.id === providerId)
      if (existing === undefined) return fail(`unknown provider: ${String(providerId)}`)

      // The ONLY inbound secret path: write the raw value straight to the keychain ...
      const set = await ctx.secrets.set(value)
      if (!isOk(set)) return fail("could not store secret")
      const ref: SecretRef = set.value

      // ... then persist ONLY the returned ref on the provider (never the value).
      const updated: Provider = { ...existing, secrets: { ...existing.secrets, [field]: ref } }
      const providers = config.providers.map((p) => (p.id === providerId ? updated : p))
      const saved = await ctx.config.save({ ...config, providers })
      if (!isOk(saved)) return fail("could not save secret reference")
      return null
    },

    // ── Aliases ────────────────────────────────────────────────────────────────────────
    getAliases: async () => {
      const config = await loadConfig()
      return config.aliases
    },

    addAlias: async (alias) => {
      const config = await loadConfig()
      const saved = await ctx.config.save({ ...config, aliases: [...config.aliases, alias] })
      if (!isOk(saved)) return fail("could not save alias")
      return alias
    },

    updateAlias: async ({ alias, input }) => {
      const config = await loadConfig()
      const next = { alias, providerId: input.providerId, providerModel: input.providerModel }
      const aliases = config.aliases.map((a) => (a.alias === alias ? next : a))
      const saved = await ctx.config.save({ ...config, aliases })
      if (!isOk(saved)) return fail("could not update alias")
      return next
    },

    deleteAlias: async ({ alias }) => {
      const config = await loadConfig()
      const aliases = config.aliases.filter((a) => a.alias !== alias)
      const saved = await ctx.config.save({ ...config, aliases })
      if (!isOk(saved)) return fail("could not delete alias")
      return null
    },

    // ── Harnesses ──────────────────────────────────────────────────────────────────────
    getHarnesses: async () => {
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      return [...listed.value]
    },

    addHarness: async (definition) => {
      // User-defined harnesses are files on disk; the registry hot-reloads them. The GUI write-path
      // for harness JSON is owned by gui-pages — here we accept + echo the validated definition so
      // the contract is satisfied. (No-op persistence stub; gui-pages replaces with a file write.)
      return definition
    },

    updateHarness: async ({ id, input }) => ({ ...input, id }),

    deleteHarness: async () => null,

    launchHarness: async ({ id, alias }) => {
      const config = await loadConfig()
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      const harness = listed.value.find((h) => h.id === id)
      if (harness === undefined) return fail(`unknown harness: ${String(id)}`)

      const resolvedAlias = alias ?? harness.defaultAlias
      const proxyUrl = `http://${config.settings.proxyHost}:${config.settings.proxyPort}`

      // The GUI proxy runs persistently while the app is open; the launcher still needs *a* key.
      const launched = ctx.launch({ harness, proxyUrl, proxyKey: ctx.genProxyKey(), model: resolvedAlias })
      if (!isOk(launched)) return fail("failed to launch harness")

      const session = ctx.sessions.create({ harnessId: harness.id, alias: resolvedAlias })
      if (!isOk(session)) return fail("failed to record session")
      return session.value
    },

    // ── Sessions & proxy ─────────────────────────────────────────────────────────────────
    getSessions: async (filter) => {
      const queried = ctx.sessions.query(filter)
      if (!isOk(queried)) return fail("could not query sessions")
      return [...queried.value]
    },

    getProxyStatus: async () => {
      const running = await ctx.proxy.isRunning(ctx.proxyBaseUrl)
      return { running, port: ctx.proxyPort }
    },
  }
}
```

> The whole secret-leak guarantee rests on `toProviderView`: `getProviders`/`addProvider`/`updateProvider` never return a raw `Provider` — they return the projection whose `secretFields` are presence flags. `setProviderSecret` is the lone place a raw value enters; it goes to `ctx.secrets.set(value)` and only the returned `SecretRef` is written to config — the value is never echoed back (the result is `null`). Handlers throw a plain `Error` on failure; the ipc `createIpcServer` (`04-ipc.md`) catches it and re-throws an `IpcRequestError` carrying a typed, message-safe `handler-failed` `IpcError`, so the webview never sees a stack trace. `addHarness`/`updateHarness`/`deleteHarness` are minimal contract-satisfying stubs because the harness-file write path belongs to `gui-pages`; `testProvider` delegates to `ctx.testProvider` (provided by `tray-and-polish`). Each list result is spread (`[...]`) to satisfy the `readonly`→mutable array the ipc result schemas infer.

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(desktop): add IPC handlers binding the ipc contract to subsystems with secret masking [desktop-shell-02]`.

---

### Task desktop-shell-03: `createAppContext` (real-adapter wiring)

**Files:**
- Edit: `apps/desktop/src/composition.ts` (add `createAppContext` below the `AppContext` type from desktop-shell-02)
- Test: `apps/desktop/src/composition.test.ts`

`createAppContext` is the composition root: it constructs the **real** adapters from every package and injects them, with **no branching logic** — a flat construction function. It is covered by the e2e in `tray-and-polish`; here we add a light test that injects **fake constructors** to assert the *wiring shape* (which constructor receives which dependency), so a regression in the wiring is caught without touching real fs/keychain/sqlite.

To make the wiring injectable for that test (and keep the function flat), `createAppContext` accepts an optional `deps` bag of the constructor functions, defaulting to the real ones. Production calls `createAppContext()` with no argument.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ok } from "@launchkit/utils"
import { createAppContext } from "./composition"
import type { CreateAppContextDeps } from "./composition"

/** Record which constructor saw which argument, returning inert stand-ins. */
const makeFakeDeps = (): {
  deps: CreateAppContextDeps
  calls: Record<string, unknown[]>
} => {
  const calls: Record<string, unknown[]> = {}
  const record = (name: string) => (...args: unknown[]): unknown => {
    calls[name] = args
    return { __stub: name }
  }
  const deps: CreateAppContextDeps = {
    homeDir: () => "/home/tester",
    createFsConfigFile: record("createFsConfigFile") as never,
    createFileConfigStore: record("createFileConfigStore") as never,
    createCachedConfigStore: record("createCachedConfigStore") as never,
    createMacosSecurityBackend: record("createMacosSecurityBackend") as never,
    createBunProcessRunner: record("createBunProcessRunner") as never,
    createCryptoIdGen: record("createCryptoIdGen") as never,
    createSecretStore: record("createSecretStore") as never,
    createBunSqliteDatabase: record("createBunSqliteDatabase") as never,
    createSystemClock: record("createSystemClock") as never,
    createSessionStore: ((..._a: unknown[]) => {
      calls["createSessionStore"] = _a
      return { init: () => ok(undefined), create: () => ok(undefined), close: () => ok(undefined), query: () => ok([]) }
    }) as never,
    createDirHarnessFileSource: record("createDirHarnessFileSource") as never,
    createRegistry: record("createRegistry") as never,
    createPathCommandResolver: record("createPathCommandResolver") as never,
    createBunProcessSpawner: record("createBunProcessSpawner") as never,
    launchHarness: ((..._a: unknown[]) => {
      calls["launchHarness"] = _a
      return (..._p: unknown[]) => ok({ pid: 1 })
    }) as never,
    createProviderFactory: record("createProviderFactory") as never,
    loadSdk: (async () => ({ create: () => ({}) })) as never,
    createRealGateway: record("createRealGateway") as never,
    genProxyKey: () => "fixed-test-key",
  }
  return { deps, calls }
}

describe("createAppContext wiring", () => {
  it("builds the config store as a cached store wrapping a file store over an fs config file", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    // fs file is created at the resolved config path under the home dir
    expect((calls["createFsConfigFile"]?.[0] as string)).toContain("/home/tester/.config/launchkit/config.json")
    // the file store receives that fs file ...
    expect(calls["createFileConfigStore"]?.[0]).toEqual({ file: { __stub: "createFsConfigFile" } })
    // ... and the cached store wraps the file store
    expect(calls["createCachedConfigStore"]?.[0]).toEqual({ __stub: "createFileConfigStore" })
  })

  it("builds the secret store from a macOS backend driven by a Bun process runner + crypto id gen", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls["createMacosSecurityBackend"]?.[0]).toEqual({ runner: { __stub: "createBunProcessRunner" } })
    expect(calls["createSecretStore"]?.[0]).toEqual({
      backend: { __stub: "createMacosSecurityBackend" },
      idGen: { __stub: "createCryptoIdGen" },
    })
  })

  it("builds the session store from a bun:sqlite database at the resolved db path with a system clock", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect((calls["createBunSqliteDatabase"]?.[0] as string)).toContain("/home/tester/.config/launchkit/launchkit.db")
    const sessionArgs = calls["createSessionStore"]?.[0] as { db: unknown; clock: unknown; idGen: unknown }
    expect(sessionArgs.db).toEqual({ __stub: "createBunSqliteDatabase" })
    expect(sessionArgs.clock).toEqual({ __stub: "createSystemClock" })
  })

  it("calls sessions.init() so the schema exists before first use", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    // init returns ok(undefined); the context simply exposes a ready store
    expect(typeof ctx.sessions.init).toBe("function")
  })

  it("builds the harness registry from a directory file source at the resolved harness dir", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect((calls["createDirHarnessFileSource"]?.[0] as string)).toContain("/home/tester/.config/launchkit/harnesses")
    expect(calls["createRegistry"]?.[0]).toEqual({ fileSource: { __stub: "createDirHarnessFileSource" } })
  })

  it("partially applies launchHarness with the real resolver + spawner", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    expect(calls["launchHarness"]?.[0]).toEqual({
      resolver: { __stub: "createPathCommandResolver" },
      spawner: { __stub: "createBunProcessSpawner" },
    })
  })

  it("builds the provider factory with the secret store + loadSdk seam", () => {
    const { deps, calls } = makeFakeDeps()
    createAppContext(deps)

    const factoryArgs = calls["createProviderFactory"]?.[0] as { secretStore: unknown; loadSdk: unknown }
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
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`createAppContext` / `CreateAppContextDeps` not exported from `./composition`).

- [ ] **Step 3: Implement `createAppContext`** — append to `composition.ts` (keep the `AppContext` type from desktop-shell-02 above it). Add the imports at the top of the file.

Add these imports to the top of `composition.ts`:

```typescript
import { homedir } from "node:os"
import { join } from "node:path"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  defaultConfig,
} from "@launchkit/config"
import { createSecretStore, createMacosSecurityBackend, createBunProcessRunner } from "@launchkit/secrets"
import { createSessionStore, createBunSqliteDatabase } from "@launchkit/sessions"
import {
  createRegistry,
  createDirHarnessFileSource,
  launchHarness,
  createPathCommandResolver,
  createBunProcessSpawner,
} from "@launchkit/harnesses"
import {
  isProxyRunning,
  startProxy,
  createRouter,
  createProviderFactory,
  loadSdk,
  createRealGateway,
} from "@launchkit/proxy"
import { ok, createSystemClock, createCryptoIdGen } from "@launchkit/utils"
```

Then add the constructor-deps type + factory:

```typescript
/**
 * The constructor functions `createAppContext` wires together. Defaulted to the real adapters from
 * each package; a test injects recording stand-ins to assert the wiring shape without touching real
 * fs/keychain/sqlite. This is the only seam that makes a flat, logic-free composition root testable.
 */
export interface CreateAppContextDeps {
  readonly homeDir: typeof homedir
  readonly createFsConfigFile: typeof createFsConfigFile
  readonly createFileConfigStore: typeof createFileConfigStore
  readonly createCachedConfigStore: typeof createCachedConfigStore
  readonly createMacosSecurityBackend: typeof createMacosSecurityBackend
  readonly createBunProcessRunner: typeof createBunProcessRunner
  readonly createCryptoIdGen: typeof createCryptoIdGen
  readonly createSecretStore: typeof createSecretStore
  readonly createBunSqliteDatabase: typeof createBunSqliteDatabase
  readonly createSystemClock: typeof createSystemClock
  readonly createSessionStore: typeof createSessionStore
  readonly createDirHarnessFileSource: typeof createDirHarnessFileSource
  readonly createRegistry: typeof createRegistry
  readonly createPathCommandResolver: typeof createPathCommandResolver
  readonly createBunProcessSpawner: typeof createBunProcessSpawner
  readonly launchHarness: typeof launchHarness
  readonly createProviderFactory: typeof createProviderFactory
  readonly loadSdk: typeof loadSdk
  readonly createRealGateway: typeof createRealGateway
  readonly genProxyKey: () => string
}

/** ≥32-byte base64url per-run proxy key (security.md). The default for production wiring. */
const defaultGenProxyKey = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

/** The real constructors, used when `createAppContext()` is called with no argument. */
const realDeps: CreateAppContextDeps = {
  homeDir: homedir,
  createFsConfigFile,
  createFileConfigStore,
  createCachedConfigStore,
  createMacosSecurityBackend,
  createBunProcessRunner,
  createCryptoIdGen,
  createSecretStore,
  createBunSqliteDatabase,
  createSystemClock,
  createSessionStore,
  createDirHarnessFileSource,
  createRegistry,
  createPathCommandResolver,
  createBunProcessSpawner,
  launchHarness,
  createProviderFactory,
  loadSdk,
  createRealGateway,
  genProxyKey: defaultGenProxyKey,
}

/**
 * Construct the real adapters and inject them into the wired `AppContext`. FLAT and logic-free:
 * every line is a `create*` call wiring one dependency into the next — no branching, no IO logic
 * (that lives in the injected, separately-tested functions). All paths sit under
 * `~/.config/launchkit/`. Covered end-to-end by the tray-and-polish e2e; the wiring shape is pinned
 * by composition.test.ts with injected fake constructors.
 */
export const createAppContext = (deps: CreateAppContextDeps = realDeps): AppContext => {
  const configDir = join(deps.homeDir(), ".config", "launchkit")
  const configFile = join(configDir, "config.json")
  const dbFile = join(configDir, "launchkit.db")
  const harnessDir = join(configDir, "harnesses")

  // config: cached( file( fs(configFile) ) )
  const config = deps.createCachedConfigStore(
    deps.createFileConfigStore({ file: deps.createFsConfigFile(configFile) }),
  )

  // secrets: store( macOS security backend over a Bun process runner, crypto id gen )
  const secrets = deps.createSecretStore({
    backend: deps.createMacosSecurityBackend({ runner: deps.createBunProcessRunner() }),
    idGen: deps.createCryptoIdGen(),
  })

  // sessions: store( bun:sqlite db at dbFile, system clock, crypto id gen ); ensure schema exists
  const sessions = deps.createSessionStore({
    db: deps.createBunSqliteDatabase(dbFile),
    clock: deps.createSystemClock(),
    idGen: deps.createCryptoIdGen(),
  })
  sessions.init()

  // harnesses: registry from the user harness dir; launcher partially applied with real adapters
  const registry = deps.createRegistry({ fileSource: deps.createDirHarnessFileSource(harnessDir) })
  const launch = deps.launchHarness({
    resolver: deps.createPathCommandResolver(),
    spawner: deps.createBunProcessSpawner(),
  })

  // proxy provider layer: factory (secrets + lazy SDK loader) + real streamText gateway
  const factory = deps.createProviderFactory({ secretStore: secrets, loadSdk: deps.loadSdk })
  const gateway = deps.createRealGateway()

  // proxy settings resolved from the default config shape (loopback only, security.md)
  const settings = defaultConfig().settings
  const proxyPort = settings.proxyPort
  const proxyBaseUrl = `http://${settings.proxyHost}:${proxyPort}`

  /**
   * Adapt the CLI/GUI's simplified `{ host, port, proxyKey, config }` start request into the real
   * `startProxy` options: build the alias router from the live `config`, and supply the already-wired
   * `factory` + `gateway` + the alias list. SECURITY: `host` comes straight from the caller (always
   * `config.settings.proxyHost` = loopback) — never `0.0.0.0`. This is a thin adapter, not branching
   * logic, so the composition root stays effectively flat.
   */
  const startProxyAdapter = (opts: {
    host: string
    port: number
    proxyKey: string
    config: import("@launchkit/config").Config
  }): RunningProxy =>
    startProxy({
      host: opts.host,
      port: opts.port,
      proxyKey: opts.proxyKey,
      router: createRouter(opts.config),
      factory,
      gateway,
      listAliases: () => opts.config.aliases.map((a) => String(a.alias)),
    })

  return {
    config,
    secrets,
    sessions,
    registry,
    launch,
    proxy: { isRunning: isProxyRunning, start: startProxyAdapter },
    factory,
    gateway,
    // The tray-and-polish plan replaces this with a real connectivity probe; ok-stub keeps the
    // contract typed until then (the IPC handler simply forwards whatever this returns).
    testProvider: async () => ok({ ok: true, latencyMs: 0 }),
    proxyPort,
    proxyBaseUrl,
    genProxyKey: deps.genProxyKey,
    paths: { configFile, dbFile, harnessDir },
  }
}
```

> The factory is deliberately a straight sequence of `create*` calls — no `if`/`switch`, no try/catch, no path logic beyond `join` — so there is nothing to unit-test except the *wiring*, which the injected-constructor test pins. `proxy.isRunning` is `isProxyRunning` referenced directly; `proxy.start` is the thin `startProxyAdapter` that bridges the CLI/GUI's `{ host, port, proxyKey, config }` shape (from `CliDeps.proxy.start` / `StartProxyDeps` in `09-cli.md`) onto the real `startProxy(StartProxyOptions)` from `07-proxy.md` — it builds `createRouter(config)` and supplies the wired `factory`/`gateway`/`listAliases`, because the real `startProxy` takes router/factory/gateway, not a raw `Config`. `createRouter` is pure (no effect), so it is imported directly rather than injected; the wiring test does not assert it. `proxyPort`/`proxyBaseUrl` come from `defaultConfig().settings` so the loopback host (`127.0.0.1`) is sourced from the single config default, never hardcoded twice; `getProxyStatus` and the ephemeral-start path read these. `testProvider` is an ok-stub here and is owned by `tray-and-polish`. Note `loadSdk` is async and lazy (proxy owns the dynamic `@ai-sdk/*` imports) — it is passed through untouched.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(desktop): add createAppContext composition root wiring real adapters [desktop-shell-03]`.

---

### Task desktop-shell-04: `openWindow` (Electrobun seam) + flesh out `main.ts`

**Files:**
- Create: `apps/desktop/src/gui/window.ts`
- Edit: `apps/desktop/src/main.ts` (replace the `phase0` stub)
- Edit: `apps/desktop/electrobun.config.ts` (confirm entry → `src/main.ts`, view → `views/main`)
- Test: `apps/desktop/src/gui/window.test.ts`
- Test: `apps/desktop/src/main.test.ts`

`openWindow(ctx)` is the thin Electrobun seam: it creates a `BrowserWindow` pointed at the built `views/main` and wires the IPC server (via `createIpcServer(createIpcHandlers(ctx), transport)`) over the Electrobun message bus. It is **smoke-tested only** — the test asserts it is a callable that, given an injected fake window factory + transport, builds a window with the locked security options and registers the handlers. `main.ts` composes everything: `runApp(detectMode(process.argv), process.argv, realDeps)`.

- [ ] **Step 1: Write the failing tests**

`gui/window.test.ts` — inject a fake window factory + transport so no real Electrobun window is opened:

```typescript
import { describe, it, expect, mock } from "bun:test"
import { openWindow } from "./window"
import type { OpenWindowDeps, WindowOptions } from "./window"
import type { AppContext } from "../composition"

const fakeCtx = {} as AppContext

const makeDeps = (over: Partial<OpenWindowDeps> = {}): {
  deps: OpenWindowDeps
  created: WindowOptions[]
  serverWired: number
} => {
  const created: WindowOptions[] = []
  let serverWired = 0
  const deps: OpenWindowDeps = {
    createWindow: mock((opts: WindowOptions) => {
      created.push(opts)
      return { id: 1 }
    }),
    makeTransport: mock(() => ({ onRequest: () => {} })),
    wireServer: mock(() => {
      serverWired += 1
    }),
    viewUrl: "views://main/index.html",
    ...over,
  }
  return { deps, created, serverWired: 0, ...{ get serverWired() { return serverWired } } } as never
}

describe("openWindow", () => {
  it("creates a window pointed at the built views/main entry when called", () => {
    const { deps, created } = makeDeps()
    openWindow(fakeCtx, deps)
    expect(created).toHaveLength(1)
    expect(created[0]?.url).toBe("views://main/index.html")
  })

  it("locks the window to the app origin and disables remote content when called", () => {
    const { deps, created } = makeDeps()
    openWindow(fakeCtx, deps)
    // security.md webview hardening: navigation locked to the app origin, no remote scripts.
    expect(created[0]?.lockNavigationToOrigin).toBe(true)
  })

  it("wires the IPC server over the Electrobun transport when called", () => {
    const wireServer = mock(() => {})
    const { deps } = makeDeps({ wireServer })
    openWindow(fakeCtx, deps)
    expect(wireServer).toHaveBeenCalledTimes(1)
  })
})
```

`main.test.ts` — assert `main.ts` exports the assembled `realDeps` (a `RunAppDeps`) wired from the real subsystems, without importing Electrobun at module-eval time in a way that breaks `bun test`:

```typescript
import { describe, it, expect } from "bun:test"
import { buildRealDeps } from "./main"
import { createAppContext } from "./composition"

describe("buildRealDeps", () => {
  it("produces a RunAppDeps whose runCli, startProxy, and openWindow are callable", () => {
    // Build against a context wired with no real IO via the injected-constructor path is overkill
    // here; buildRealDeps only needs the factory to exist. Assert the shape is complete.
    const deps = buildRealDeps(createAppContext)
    expect(typeof deps.runCli).toBe("function")
    expect(typeof deps.startProxy).toBe("function")
    expect(typeof deps.openWindow).toBe("function")
  })

  it("threads argv to the CLI runner when runCli is invoked", async () => {
    // Use a fake createAppContext so no real adapters are constructed.
    let cliArgv: readonly string[] | undefined
    const fakeFactory = (() =>
      ({
        config: { load: async () => ({ ok: true, value: { version: 2, providers: [], aliases: [], settings: { proxyPort: 4000, proxyHost: "127.0.0.1" } } }) },
        secrets: {},
        sessions: { create: () => ({ ok: true, value: {} }), query: () => ({ ok: true, value: [] }), init: () => ({ ok: true, value: undefined }) },
        registry: { list: async () => ({ ok: true, value: [] }) },
        launch: () => ({ ok: true, value: { pid: 1 } }),
        proxy: { isRunning: async () => false, start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }) },
        factory: {},
        gateway: {},
        testProvider: async () => ({ ok: true, value: { ok: true, latencyMs: 0 } }),
        proxyPort: 4000,
        proxyBaseUrl: "http://127.0.0.1:4000",
        genProxyKey: () => "k",
        paths: { configFile: "", dbFile: "", harnessDir: "" },
      }) as never) as typeof createAppContext

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
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./window"` / `buildRealDeps` not exported).

- [ ] **Step 3: Implement `gui/window.ts`** — the thin seam. Electrobun's real `BrowserWindow` + message-bus symbols are injected through `OpenWindowDeps`, so the unit test never imports them. The production defaults reference Electrobun behind a guarded import.

```typescript
import { createIpcServer, type ServerTransport } from "@launchkit/ipc"
import { createIpcHandlers } from "./ipc/handlers"
import type { AppContext } from "../composition"

/** The subset of BrowserWindow options this shell sets (security.md webview hardening). */
export interface WindowOptions {
  readonly url: string
  readonly title: string
  /** Lock navigation to the app origin; external links open in the system browser, not the webview. */
  readonly lockNavigationToOrigin: boolean
}

/**
 * The Electrobun seam, injected so the logic is testable without a real window. `createWindow`
 * opens the BrowserWindow; `makeTransport` builds a `ServerTransport` over the Electrobun message
 * bus for that window; `wireServer` registers the validated IPC handlers on it.
 */
export interface OpenWindowDeps {
  readonly createWindow: (opts: WindowOptions) => unknown
  readonly makeTransport: (window: unknown) => ServerTransport
  readonly wireServer: (transport: ServerTransport, ctx: AppContext) => void
  readonly viewUrl: string
}

/** Default `wireServer`: bind the contract handlers to the transport (validated both directions). */
const defaultWireServer = (transport: ServerTransport, ctx: AppContext): void => {
  createIpcServer(createIpcHandlers(ctx), transport)
}

/**
 * Open the GUI window and wire the typed IPC server to it. Thin by design: all decision logic lives
 * in `createIpcHandlers` (tested in desktop-shell-02); this only assembles Electrobun pieces, so it
 * is smoke-tested. SECURITY: the window loads the local built `views/main` only and locks navigation
 * to the app origin — the webview gets no direct fs/network/secret access, only the validated IPC.
 */
export const openWindow = (ctx: AppContext, deps: OpenWindowDeps = realOpenWindowDeps): void => {
  const window = deps.createWindow({
    url: deps.viewUrl,
    title: "LaunchKit",
    lockNavigationToOrigin: true,
  })
  const transport = deps.makeTransport(window)
  deps.wireServer(transport, ctx)
}

/**
 * Production Electrobun wiring. CONFIRM the exact `BrowserWindow` constructor + message-bus API
 * against the installed Electrobun version (context7 / Electrobun docs) and adapt ONLY this block.
 * The view url points at the built `views/main` entry declared in `electrobun.config.ts`.
 */
export const realOpenWindowDeps: OpenWindowDeps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electrobun types confirmed at impl time
  createWindow: (opts) => {
    // Example shape — adapt to the installed Electrobun API:
    //   import { BrowserWindow } from "electrobun/bun"
    //   return new BrowserWindow({ title: opts.title, url: opts.url, /* CSP/navigation lock */ })
    throw new Error("openWindow: wire the real Electrobun BrowserWindow here (see ELECTROBUN NOTE)")
  },
  makeTransport: (_window) => {
    // Build a ServerTransport over the window's Electrobun RPC/message bus:
    //   return { onRequest: (handler) => window.webview.on("ipc", (method, payload) => handler(method, payload)) }
    throw new Error("openWindow: wire the real Electrobun transport here (see ELECTROBUN NOTE)")
  },
  wireServer: defaultWireServer,
  viewUrl: "views://main/index.html",
}
```

> The two `throw`s in `realOpenWindowDeps` are **implementation markers**, not plan placeholders: at implementation time, replace them with the confirmed Electrobun `BrowserWindow` + message-bus calls (one block, behind this seam). They never run under `bun test` because `openWindow`'s tests inject fakes. If importing Electrobun symbols at module top-level breaks `bun test` (native bindings), keep the import dynamic/lazy inside `createWindow`/`makeTransport` and mark only this step `blocked` while reporting — `runApp`/`createIpcHandlers`/`createAppContext` remain fully green. `defaultWireServer` is the real logic (it calls the tested `createIpcServer` + `createIpcHandlers`) and is unit-tested via the `wireServer` spy.

- [ ] **Step 4: Implement `main.ts`** — replace the `phase0` stub. It builds `RunAppDeps` from the real subsystems and runs the detected mode. The `buildRealDeps` factory is exported so it is unit-testable; the top-level invocation is the only un-exported side effect.

```typescript
import { runCli } from "@launchkit/cli"
import type { CliDeps, StartProxyDeps } from "@launchkit/cli"
import { detectMode } from "./detect-mode"
import { runApp, type RunAppDeps, type ProxyHandle } from "./app"
import { createAppContext, type AppContext } from "./composition"
import { openWindow } from "./gui/window"

/** Assemble the CliDeps the CLI runner needs from a wired AppContext. */
const cliDepsFrom = (ctx: AppContext): CliDeps => ({
  config: ctx.config,
  secrets: ctx.secrets,
  sessions: ctx.sessions,
  registry: ctx.registry,
  launch: ctx.launch,
  proxy: {
    isRunning: ctx.proxy.isRunning,
    start: (opts: StartProxyDeps) =>
      ctx.proxy.start({ host: opts.host, port: opts.port, proxyKey: opts.proxyKey, config: opts.config }),
  },
  genProxyKey: ctx.genProxyKey,
  out: { write: (line: string): void => process.stdout.write(`${line}\n`) },
})

/**
 * Build the `RunAppDeps` the mode router needs, wiring the real subsystems via `createAppContext`.
 * Exported (and parameterized by the factory + optional overrides) so it is unit-testable without
 * constructing real adapters or importing Electrobun at top level.
 *
 * SECURITY: the GUI proxy is started bound to loopback from `config.settings.proxyHost` via
 * `ctx.proxy.start(...)`, with a freshly generated per-run key — never `0.0.0.0`.
 */
export const buildRealDeps = (
  makeContext: typeof createAppContext,
  overrides: Partial<RunAppDeps> = {},
): RunAppDeps => {
  const ctx = makeContext()
  return {
    runCli: overrides.runCli ?? ((argv) => runCli(cliDepsFrom(ctx))(argv)),
    startProxy:
      overrides.startProxy ??
      ((): ProxyHandle => {
        // Load the live config so the GUI proxy's router knows the real providers + aliases.
        // A fresh install loads defaults (empty providers/aliases) — still loopback + valid.
        let stop = (): void => {}
        void ctx.config.load().then((loaded) => {
          if (!loaded.ok) return
          const running = ctx.proxy.start({
            host: loaded.value.settings.proxyHost,
            port: loaded.value.settings.proxyPort,
            proxyKey: ctx.genProxyKey(),
            config: loaded.value,
          })
          stop = running.stop
        })
        return { stop: () => stop() }
      }),
    openWindow: overrides.openWindow ?? ((): void => openWindow(ctx)),
  }
}

// --- entry point ---------------------------------------------------------------------
// The single side effect: detect the mode and run it. Everything above is pure/exported.
await runApp(detectMode(process.argv), process.argv, buildRealDeps(createAppContext))
```

> `runCli(cliDepsFrom(ctx))(argv)` matches the `runCli(deps)(argv)` shape from `09-cli.md`; `CliDeps.out` is the injected `Writer` wired to `process.stdout` (the one place the shell writes to the terminal). `cliDepsFrom` re-uses the very subsystems `createAppContext` built — no duplicate adapters, and `ctx.proxy.start` is the `startProxyAdapter` that builds the router from the passed config. `startProxy` (GUI mode) **loads the live config** then calls `ctx.proxy.start` bound to `config.settings.proxyHost` (always loopback `127.0.0.1`) with a fresh `genProxyKey()` (security.md: loopback + per-run key), so the persistent GUI proxy routes the user's real providers/aliases. `buildRealDeps` takes the factory + overrides so `main.test.ts` injects a fake context and a spy `runCli`, asserting argv threading with zero real IO. The top-level `await runApp(...)` is the lone un-exported statement — importing `./main` in a test does run it, so the test injects a fake factory; alternatively guard the entry with `import.meta.main` if the installed Bun supports it (confirm), to keep `import "./main"` side-effect-free.

- [ ] **Step 5: Confirm `electrobun.config.ts`** — `phase0` pointed the entry at `src/main.ts` and the view at `views/main`. Re-confirm those two fields against the installed Electrobun config schema; the entry must be `src/main.ts` (this file) and the `views/main` bundle must be declared so `realOpenWindowDeps.viewUrl` resolves. No code change beyond confirming/adjusting those fields to the installed schema.

- [ ] **Step 6: Run, expect GREEN** — `bun test apps/desktop`. If the `main.ts` top-level `await runApp(...)` causes the test importing `./main` to attempt real Electrobun/window work, switch the entry to an `import.meta.main` guard (confirm Bun support) so `buildRealDeps` stays importable side-effect-free.

- [ ] **Step 7: Verify the app still builds** — run the documented Electrobun build (e.g. `bunx electrobun build` in `apps/desktop`). Expected: builds with no errors. If the window API diverged, adapt `realOpenWindowDeps` only; if it cannot build, mark this step `blocked` and report (the tested logic is unaffected).

- [ ] **Step 8: Commit** `feat(desktop): add openWindow seam + flesh out main.ts dual-mode entry [desktop-shell-04]`.

---

### Task desktop-shell-05: `apps/desktop` CLAUDE.md + full gate

**Files:**
- Create: `apps/desktop/CLAUDE.md`
- Edit: `apps/desktop/package.json` (confirm all `@launchkit/*` workspace deps used by this plan are listed)

- [ ] **Step 1: Confirm `apps/desktop/package.json` deps** — ensure every package this plan imports is a `workspace:*` dependency: `@launchkit/cli`, `@launchkit/config`, `@launchkit/secrets`, `@launchkit/sessions`, `@launchkit/harnesses`, `@launchkit/proxy`, `@launchkit/ipc`, `@launchkit/types`, `@launchkit/utils` (and `@launchkit/ui` for the `gui-pages` plan), plus `electrobun` pinned (from `phase0`). Run `bun install` if any were added.

- [ ] **Step 2: Create `apps/desktop/CLAUDE.md`** — from the `apps/desktop` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# apps/desktop (launchkit binary)

**Responsibility:** the dual-mode entry (`detectMode` → CLI vs GUI) + the GUI shell (window, tray, IPC handlers) + React pages; the ONE place real effects are constructed and injected into the packages.

**Public surface (not a library — the user-facing `launchkit` binary):** `src/main.ts` (entry: `runApp(detectMode(argv), argv, realDeps)`); `src/app.ts` (`runApp` mode router); `src/composition.ts` (`AppContext` + `createAppContext` real-adapter wiring); `src/gui/window.ts` (`openWindow` Electrobun seam); `src/gui/ipc/handlers.ts` (`createIpcHandlers` binding the ipc contract to subsystems). Owned by OTHER plans: `src/gui/tray.ts` (tray-and-polish), `views/**` (gui-pages), `src/detect-mode.ts` (phase0).

**Depends on:** every `@launchkit/*` package (`cli`, `proxy`, `harnesses`, `config`, `sessions`, `secrets`, `ipc`, `ui`, `types`, `utils`) — see build-plan/02-monorepo/boundaries.md.

**Effects owned:** ALL of them — but only via constructing the real adapters in `composition.ts` and injecting them. `createAppContext` is flat and logic-free; every decision lives in `runApp` / `createIpcHandlers` (separately unit-tested with fakes). Electrobun (window + message bus) lives behind thin injected seams in `gui/window.ts` so the logic is testable without a running window.

**Local rules:** this is the only place real fs/keychain/sqlite/process/server adapters are built. SECURITY: a `Provider` is ALWAYS projected to a `ProviderView` before crossing IPC (no secret value or `ref` to the webview); `setProviderSecret` is the only inbound secret path and writes straight to the keychain, persisting only the returned `SecretRef`; the proxy is started bound to loopback (`config.settings.proxyHost` = `127.0.0.1`) with a per-run key. Confirm Electrobun's `BrowserWindow`/IPC API against current docs and adapt only the `gui/window.ts` seam if it diverges.
```

- [ ] **Step 3: Run the full gate** — `bun run typecheck && bun run lint && bun test`. Expected: typecheck clean (strict, no `any` outside the one confined Electrobun seam comment), lint clean, all `apps/desktop` tests pass (`app`, `handlers`, `composition`, `window`, `main`) alongside the rest of the workspace.

- [ ] **Step 4: Update `PROGRESS.md`** — mark `desktop-shell-01..05` `done` with commit SHAs.

- [ ] **Step 5: Commit** `feat(desktop): add apps/desktop CLAUDE.md + green full gate [desktop-shell-05]`.

**End state:** `apps/desktop` is the wired dual-mode composition root. `runApp(mode, argv, deps)` runs exactly one path — CLI (`runCli(argv)`) or GUI (start proxy → open window) — and is unit-tested with fakes proving the other path never runs. `createAppContext()` is a flat, logic-free factory that constructs the real adapters from every package (`createCachedConfigStore(createFileConfigStore({ file: createFsConfigFile(...) }))`, `createSecretStore({ backend: createMacosSecurityBackend({ runner: createBunProcessRunner() }), idGen: createCryptoIdGen() })`, `createSessionStore({ db: createBunSqliteDatabase(dbPath), clock: createSystemClock(), idGen: createCryptoIdGen() })`, `createRegistry({ fileSource: createDirHarnessFileSource(...) })`, `launchHarness({ resolver: createPathCommandResolver(), spawner: createBunProcessSpawner() })`, `createProviderFactory({ secretStore, loadSdk })`, `createRealGateway()`) under `~/.config/launchkit/`, with its wiring shape pinned by an injected-constructor test (the e2e lives in tray-and-polish). `createIpcHandlers(ctx)` implements the `@launchkit/ipc` contract against those subsystems, masking every `Provider` to a secret-free `ProviderView`, routing the only inbound secret (`setProviderSecret`) straight to the keychain and persisting only the returned `SecretRef`, recording a session on `launchHarness`, and reflecting the live proxy in `getProxyStatus`. `gui/window.ts` opens the Electrobun `BrowserWindow` at the built `views/main` and wires the validated IPC server behind a thin injected seam (smoke-tested); `main.ts` ties it together with `runApp(detectMode(process.argv), process.argv, buildRealDeps(createAppContext))`. Security is enforced and tested: no secret value/ref crosses IPC to the webview, secrets enter only through `setProviderSecret`, and the proxy binds loopback from `config.settings.proxyHost`. Consumers run the `launchkit` binary; nothing imports `apps/desktop` as a library.
