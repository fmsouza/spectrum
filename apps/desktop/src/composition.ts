import type { ConfigStore } from "@launchkit/config"
import type {
  HarnessError,
  HarnessRegistry,
  LaunchParams,
  ResolvedHarnessLaunch,
} from "@launchkit/harnesses"
import type { ProjectStore } from "@launchkit/projects"
import { createProjectStore } from "@launchkit/projects"
import type {
  LanguageModelGateway,
  ProviderFactory,
  RunningProxy,
  RuntimeState,
} from "@launchkit/proxy"
import type { PtyError, SessionSink, TerminalManager } from "@launchkit/pty"
import type { SecretStore } from "@launchkit/secrets"
import type { SessionStore } from "@launchkit/sessions"
import type { SessionId } from "@launchkit/types"
import type { Result } from "@launchkit/utils"

import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { AgentDriver, RunManager } from "@launchkit/agent-driver"
import {
  createFakeDriver,
  createRunManager,
  demoScript,
} from "@launchkit/agent-driver"
import type { StoredEvent } from "@launchkit/agent-events"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  defaultConfig,
} from "@launchkit/config"
import { createSqliteClient, runMigrations } from "@launchkit/db"
import { createClaudeDriver } from "@launchkit/driver-claude"
import {
  createBunProcessSpawner,
  createDirHarnessFileSource,
  createPathCommandResolver,
  createRegistry,
  launchHarness,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
import {
  createFetchHttpGet,
  createFileRuntimeState,
  createModelLister,
  createProviderFactory,
  createProviderTester,
  createRealGateway,
  createRouter,
  isProxyRunning,
  loadSdk,
  startProxy,
} from "@launchkit/proxy"
import {
  createBunScrollbackFs,
  createFfiPty,
  createFileScrollbackStore,
  createTerminalManager,
} from "@launchkit/pty"
import { createRunStore } from "@launchkit/run-store"
import {
  createBunProcessRunner,
  createMacosSecurityBackend,
  createSecretStore,
} from "@launchkit/secrets"
import { createSessionStore } from "@launchkit/sessions"
import { createCryptoIdGen, createSystemClock } from "@launchkit/utils"
import { err } from "@launchkit/utils"
import { withDemoHarness } from "./gui/demo-harness"
import {
  DEMO_HARNESS_ID,
  type DriverRegistry,
  createDriverRegistry,
} from "./gui/driver-registry"
import { startRunnerSocket } from "./gui/runner-socket"
import { startTerminalSocket } from "./gui/terminal-socket"

/** Result of testing one provider's live connectivity (mirrors ipc TestProviderResult). */
export type ProviderTestResult = {
  readonly ok: boolean
  readonly latencyMs: number
}

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
  readonly projects: ProjectStore
  readonly registry: HarnessRegistry
  /** `launchHarness(realDeps)` partially applied — a single `(params) => Result<{ pid, exited }, unknown>`. */
  readonly launch: (
    params: LaunchParams,
  ) => Result<
    { readonly pid: number; readonly exited: Promise<number> },
    unknown
  >
  /**
   * `resolveHarnessLaunch({ resolver })` partially applied: resolves a harness's command + renders
   * its proxy env WITHOUT spawning. The GUI embedded-terminal path uses this (then hands the result
   * to `ctx.terminal.launch`); the headless `ctx.launch` keeps owning the CLI spawn path.
   */
  readonly resolveLaunch: (
    params: LaunchParams,
  ) => Result<ResolvedHarnessLaunch, HarnessError>
  readonly proxy: {
    isRunning(baseUrl: string): Promise<boolean>
    start(opts: {
      host: string
      port: number
      proxyKey: string
      config: import("@launchkit/config").Config
    }): RunningProxy
  }
  readonly factory: ProviderFactory
  readonly gateway: LanguageModelGateway
  /**
   * Persists the GUI proxy's per-run key so the CLI `launch` can reuse it (avoiding a
   * mismatched key the running proxy would reject). Holds only the per-run token — never a secret.
   */
  readonly runtime: RuntimeState
  /** Test one provider's connectivity. The real implementation is provided by the tray-and-polish plan. */
  readonly testProvider: (
    providerId: string,
  ) => Promise<Result<ProviderTestResult, unknown>>
  /**
   * Discover the live model list for a provider: look up the provider in config, resolve its apiKey
   * from the keychain (keyless providers such as ollama pass apiKey=undefined), then call the proxy
   * ModelLister. SECURITY: the apiKey is resolved server-side and used only for the outbound request;
   * it never crosses to the view.
   */
  readonly listProviderModels: (
    providerId: string,
  ) => Promise<Result<readonly string[], unknown>>
  /** The configured proxy port (from `config.settings.proxyPort`), surfaced for `getProxyStatus`. */
  readonly proxyPort: number
  /** The loopback proxy base URL (`http://127.0.0.1:<port>`), used by `proxy.isRunning`. */
  readonly proxyBaseUrl: string
  /** Mints the per-run >=32-byte proxy key (security.md) when the shell starts an ephemeral proxy. */
  readonly genProxyKey: () => string
  /**
   * The embedded-terminal engine for the GUI: allocates a real PTY per launched harness and streams
   * its bytes over a dedicated loopback WebSocket (`terminalSocketUrl`). Its `send` sink is a no-op
   * until the terminal socket binds it on connect. Unused by the CLI/`launch` headless path.
   */
  readonly terminal: TerminalManager
  /** Loopback `ws://localhost:<port>/` the webview connects to for the PTY byte stream. */
  readonly terminalSocketUrl: string
  /**
   * The native run engine: starts an AgentDriver per launched native harness and streams its canonical
   * events over a dedicated loopback WebSocket (`runnerSocketUrl`). Its `send` sink is a no-op until the
   * runner socket binds it on connect. Twin of `terminal` for driver-backed harnesses.
   */
  readonly runner: RunManager
  /** Loopback `ws://localhost:<port>/` the webview connects to for the canonical run-event stream. */
  readonly runnerSocketUrl: string
  /** Read a session's stored canonical event log for read-only replay (mirrors `readScrollback`). */
  readonly runEvents: {
    read(
      id: SessionId,
    ): Result<
      readonly StoredEvent[],
      { readonly kind: "db-failed"; readonly detail: string }
    >
  }
  /** Which harnesses launch natively (a driver is registered) vs. via the embedded terminal. */
  readonly driverRegistry: DriverRegistry
  /** Resolved settings paths (config + db + harness dir), surfaced for diagnostics/tests. */
  readonly paths: {
    readonly configFile: string
    readonly dbFile: string
    readonly harnessDir: string
  }
  /**
   * Open the native folder picker (Electrobun `Utils.openFileDialog`, directories only). Reached via
   * a LAZY dynamic import so `bun test` never loads native FFI; resolves the selected paths ([] if
   * cancelled). The `pickFolder` IPC handler maps the first path to `{ path }` (or `{}`).
   */
  readonly pickFolder: (opts: {
    readonly startingFolder?: string
  }) => Promise<readonly string[]>
  /**
   * Read a session's captured terminal bytes from the file-backed scrollback store, for the
   * read-only replay pane. Returns the raw bytes; the `getSessionScrollback` handler base64-encodes
   * them.
   */
  readonly readScrollback: (id: SessionId) => Result<Uint8Array, PtyError>
}

/**
 * The constructor functions `createAppContext` wires together. Defaulted to the real adapters from
 * each package; a test injects recording stand-ins to assert the wiring shape without touching real
 * fs/keychain/sqlite. This is the only seam that makes a flat, logic-free composition root testable.
 */
export interface CreateAppContextDeps {
  readonly homeDir: typeof homedir
  readonly mkdirSync: typeof mkdirSync
  readonly createFsConfigFile: typeof createFsConfigFile
  readonly createFileConfigStore: typeof createFileConfigStore
  readonly createCachedConfigStore: typeof createCachedConfigStore
  readonly createMacosSecurityBackend: typeof createMacosSecurityBackend
  readonly createBunProcessRunner: typeof createBunProcessRunner
  readonly createCryptoIdGen: typeof createCryptoIdGen
  readonly createSecretStore: typeof createSecretStore
  readonly createSqliteClient: typeof createSqliteClient
  readonly runMigrations: typeof runMigrations
  readonly createSystemClock: typeof createSystemClock
  readonly createSessionStore: typeof createSessionStore
  readonly createProjectStore: typeof createProjectStore
  readonly createDirHarnessFileSource: typeof createDirHarnessFileSource
  readonly createRegistry: typeof createRegistry
  readonly createPathCommandResolver: typeof createPathCommandResolver
  readonly createBunProcessSpawner: typeof createBunProcessSpawner
  readonly launchHarness: typeof launchHarness
  readonly createProviderFactory: typeof createProviderFactory
  readonly loadSdk: typeof loadSdk
  readonly createRealGateway: typeof createRealGateway
  readonly createFileRuntimeState: typeof createFileRuntimeState
  readonly createBunScrollbackFs: typeof createBunScrollbackFs
  readonly createFileScrollbackStore: typeof createFileScrollbackStore
  readonly createFfiPty: typeof createFfiPty
  readonly createTerminalManager: typeof createTerminalManager
  readonly startTerminalSocket: typeof startTerminalSocket
  readonly createRunStore: typeof createRunStore
  readonly createRunManager: typeof createRunManager
  readonly startRunnerSocket: typeof startRunnerSocket
  readonly createFakeDriver: typeof createFakeDriver
  /** Set in dev to register the demo FakeDriver; production leaves it unset so the terminal path is unchanged. */
  readonly demoHarnessEnabled: boolean
  readonly genProxyKey: () => string
}

/** >=32-byte base64url per-run proxy key (security.md). The default for production wiring. */
const defaultGenProxyKey = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

/** The real constructors, used when `createAppContext()` is called with no argument. */
const realDeps: CreateAppContextDeps = {
  homeDir: homedir,
  mkdirSync,
  createFsConfigFile,
  createFileConfigStore,
  createCachedConfigStore,
  createMacosSecurityBackend,
  createBunProcessRunner,
  createCryptoIdGen,
  createSecretStore,
  createSqliteClient,
  runMigrations,
  createSystemClock,
  createSessionStore,
  createProjectStore,
  createDirHarnessFileSource,
  createRegistry,
  createPathCommandResolver,
  createBunProcessSpawner,
  launchHarness,
  createProviderFactory,
  loadSdk,
  createRealGateway,
  createFileRuntimeState,
  createBunScrollbackFs,
  createFileScrollbackStore,
  createFfiPty,
  createTerminalManager,
  startTerminalSocket,
  createRunStore,
  createRunManager,
  startRunnerSocket,
  createFakeDriver,
  demoHarnessEnabled: process.env.LAUNCHKIT_DEMO_HARNESS === "1",
  genProxyKey: defaultGenProxyKey,
}

/**
 * Build the `testProvider` function that delegates to `@launchkit/proxy`'s
 * `createProviderTester`. Resolves the provider from the live config, picks its
 * first model (falling back to the provider id), and measures connectivity with
 * the already-wired factory + gateway. Extracted so Biome's noUnusedImports
 * rule sees the `err` / `createProviderTester` usage at module scope.
 */
const createTestProvider = (
  config: ConfigStore,
  factory: ProviderFactory,
  gateway: LanguageModelGateway,
  createSystemClock: () => import("@launchkit/utils").Clock,
): AppContext["testProvider"] => {
  return async (providerId) => {
    const loaded = await config.load()
    if (!loaded.ok) return loaded
    const provider = loaded.value.providers.find(
      (p) => String(p.id) === providerId,
    )
    if (provider === undefined)
      return err({ kind: "unknown-provider", providerId })
    const providerModel = provider.models[0] ?? providerId
    const providerTester = createProviderTester({
      factory,
      gateway,
      clock: createSystemClock(),
    })
    return providerTester(provider, providerModel)
  }
}

/**
 * Build the `listProviderModels` function that delegates to `@launchkit/proxy`'s
 * `createModelLister`. Resolves the provider from the live config, resolves its apiKey
 * from the keychain (keyless providers like ollama have no secrets — apiKey stays undefined),
 * then calls the lister. The ModelLister is constructed once and closed over.
 * SECURITY: apiKey is resolved from the keychain and passed only to the outbound HTTP request;
 * it is never returned to the view.
 */
const createListProviderModels = (
  config: ConfigStore,
  secrets: import("@launchkit/secrets").SecretStore,
): AppContext["listProviderModels"] => {
  const lister = createModelLister({ httpGet: createFetchHttpGet() })
  return async (providerId) => {
    const loaded = await config.load()
    if (!loaded.ok) return loaded
    const provider = loaded.value.providers.find(
      (p) => String(p.id) === providerId,
    )
    if (provider === undefined)
      return err({ kind: "unknown-provider", providerId })

    // Resolve the apiKey from the keychain. Providers without secrets (e.g. ollama) have an
    // empty secrets record, so apiKey stays undefined — the lister handles that gracefully.
    let apiKey: string | undefined
    const apiKeyRef = provider.secrets.apiKey
    if (apiKeyRef !== undefined) {
      const got = await secrets.get(apiKeyRef)
      if (!got.ok) return got
      apiKey = got.value
    }

    return lister({
      sdkProvider: provider.sdkProvider,
      config: provider.config,
      ...(apiKey !== undefined ? { apiKey } : {}),
    })
  }
}

/**
 * Construct the real adapters and inject them into the wired `AppContext`. FLAT and logic-free:
 * every line is a `create*` call wiring one dependency into the next — no branching, no IO logic
 * (that lives in the injected, separately-tested functions). All paths sit under
 * `~/.config/launchkit/`. Covered end-to-end by the tray-and-polish e2e; the wiring shape is pinned
 * by composition.test.ts with injected fake constructors.
 */
export const createAppContext = (
  deps: CreateAppContextDeps = realDeps,
): AppContext => {
  const configDir = join(deps.homeDir(), ".config", "launchkit")
  const configFile = join(configDir, "config.json")
  const dbFile = join(configDir, "launchkit.db")
  const harnessDir = join(configDir, "harnesses")
  const scrollbackDir = join(configDir, "scrollback")
  const runtimeFile = join(configDir, "runtime.json")

  // config: cached( file( fs(configFile) ) ). Wrapped to keep a synchronous snapshot of the latest
  // config (`liveConfig`) updated on every load/save, so the long-running GUI proxy can resolve
  // against live provider/model changes without an app restart. (The cached store already refreshes
  // its own cache on save; this just exposes that latest value synchronously to the proxy router.)
  const baseConfig = deps.createCachedConfigStore(
    deps.createFileConfigStore({ file: deps.createFsConfigFile(configFile) }),
  )
  let liveConfig: import("@launchkit/config").Config | undefined
  const config: ConfigStore = {
    load: async () => {
      const loaded = await baseConfig.load()
      if (loaded.ok) liveConfig = loaded.value
      return loaded
    },
    save: async (next) => {
      const saved = await baseConfig.save(next)
      if (saved.ok) liveConfig = next
      return saved
    },
  }

  // secrets: store( macOS security backend over a Bun process runner, crypto id gen )
  const secrets = deps.createSecretStore({
    backend: deps.createMacosSecurityBackend({
      runner: deps.createBunProcessRunner(),
    }),
    idGen: deps.createCryptoIdGen(),
  })

  // sessions: open sqlite at dbFile, apply migrations, then build the store.
  const dbOpen = deps.createSqliteClient(dbFile)
  if (!dbOpen.ok) {
    throw new Error(
      `failed to open database at ${dbFile}: ${dbOpen.error.detail}`,
    )
  }
  const dbClient = dbOpen.value
  const migrated = deps.runMigrations(dbClient)
  if (!migrated.ok) {
    throw new Error(`failed to migrate database: ${migrated.error.detail}`)
  }
  const sessions = deps.createSessionStore({
    db: dbClient,
    clock: deps.createSystemClock(),
    idGen: deps.createCryptoIdGen(),
  })

  const projects = deps.createProjectStore({
    db: dbClient,
    clock: deps.createSystemClock(),
    idGen: deps.createCryptoIdGen(),
  })

  // Every embedded-terminal session must belong to a project. Resolve (or create) the project
  // from the launch cwd, then create the session with its projectId. This is the single GUI
  // orchestration seam — SessionStore.create stays pure (it just receives a projectId).
  const sessionSink: SessionSink = {
    create: (input) => {
      const cwd = input.cwd ?? ""
      const project = projects.findOrCreateByPath(cwd)
      if (!project.ok)
        return err({
          kind: "db-failed",
          detail:
            project.error.kind === "invalid-path"
              ? "a working directory is required"
              : project.error.detail,
        })
      return sessions.create({
        harnessId: input.harnessId,
        projectId: project.value.id,
        cwd,
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
      })
    },
    close: sessions.close,
  }

  // harnesses: registry from the user harness dir; launcher partially applied with real adapters
  const baseRegistry = deps.createRegistry({
    fileSource: deps.createDirHarnessFileSource(harnessDir),
  })
  // Dev-only (LAUNCHKIT_DEMO_HARNESS=1): surface a launchable `demo` harness — driven by the FakeDriver
  // registered in the driver registry below — so the native conversation view is reachable from the New
  // Session modal. Production (flag unset) leaves the harness registry untouched, so every real harness
  // still launches into the embedded terminal exactly as before.
  const registry = deps.demoHarnessEnabled
    ? withDemoHarness(baseRegistry)
    : baseRegistry
  // ONE resolver shared by both launch paths: the headless `launch` (CLI spawn) and the GUI's
  // `resolveLaunch` (resolve command + render proxy env, then hand to `terminal.launch`).
  const resolver = deps.createPathCommandResolver()
  const launch = deps.launchHarness({
    resolver,
    spawner: deps.createBunProcessSpawner(),
  })
  const resolveLaunch = resolveHarnessLaunch({ resolver })

  // proxy provider layer: factory (secrets + lazy SDK loader) + real streamText gateway
  const factory = deps.createProviderFactory({
    secretStore: secrets,
    loadSdk: deps.loadSdk,
  })
  const gateway = deps.createRealGateway()

  // runtime: persists only the running proxy's per-run key so the CLI can reuse it
  const runtime = deps.createFileRuntimeState(runtimeFile)

  // terminal: the GUI embedded-terminal engine over a real FFI pty + the session store. Its `send`
  // sink is a no-op until window.ts binds the real Electrobun `messages` channel via `bindSend`.
  deps.mkdirSync(scrollbackDir, { recursive: true })
  // Persisted per-session scrollback (read-only replay reads from here after a session ends).
  const scrollbackStore = deps.createFileScrollbackStore({
    dir: scrollbackDir,
    fs: deps.createBunScrollbackFs(),
  })
  const terminal = deps.createTerminalManager({
    pty: deps.createFfiPty(),
    sessions: sessionSink,
    scrollback: scrollbackStore,
    send: () => {},
    capBytes: 1_000_000,
    defaultSize: { cols: 80, rows: 24 },
  })
  // The dedicated loopback WebSocket for the PTY byte stream binds `terminal`'s send sink on connect.
  const terminalSocketUrl = deps.startTerminalSocket(terminal).url

  // Native run path (additive): structured canonical events persisted to the shared db and streamed
  // over a second loopback socket. The RunStore structurally satisfies the RunManager's RunEventSink;
  // sessionSink structurally satisfies its SessionSink.
  const runStore = deps.createRunStore({
    db: dbClient,
    clock: deps.createSystemClock(),
  })

  // Native drivers (hard cutover): `claude` always launches native via createClaudeDriver. The demo
  // FakeDriver stays dev-gated (LAUNCHKIT_DEMO_HARNESS=1). Each driver injects its own effects so the
  // logic stays unit-testable; the runtime owns the sync↔async bridge + lifecycle.
  const idGen = deps.createCryptoIdGen()
  const driverRegistry: DriverRegistry = createDriverRegistry({
    claude: createClaudeDriver({ idGen }),
    ...(deps.demoHarnessEnabled
      ? { [DEMO_HARNESS_ID]: deps.createFakeDriver({ script: demoScript }) }
      : {}),
  })

  // One AgentDriver for the RunManager: route start() to the registered driver for the harness.
  const routingDriver: AgentDriver = {
    start: (input) => {
      const driver = driverRegistry.get(input.harnessId)
      if (driver === undefined)
        return err({
          kind: "start-failed",
          detail: `no driver for harness ${String(input.harnessId)}`,
        })
      return driver.start(input)
    },
  }

  const runner = deps.createRunManager({
    driver: routingDriver,
    sessions: sessionSink,
    events: runStore,
    clock: deps.createSystemClock(),
    send: () => {},
  })
  // The dedicated loopback WebSocket for the run-event stream binds `runner`'s send sink on connect.
  const runnerSocketUrl = deps.startRunnerSocket(runner).url

  // proxy settings resolved from the default config shape (loopback only, security.md)
  const settings = defaultConfig().settings
  const proxyPort = settings.proxyPort
  const proxyBaseUrl = `http://${settings.proxyHost}:${proxyPort}`

  /**
   * Adapt the CLI/GUI's simplified `{ host, port, proxyKey, config }` start request into the real
   * `startProxy` options: build the model router from the live `config`, and supply the already-wired
   * `factory` + `gateway` + the model list. SECURITY: `host` comes straight from the caller (always
   * `config.settings.proxyHost` = loopback) — never `0.0.0.0`. This is a thin adapter, not branching
   * logic, so the composition root stays effectively flat.
   */
  const startProxyAdapter = (opts: {
    host: string
    port: number
    proxyKey: string
    config: import("@launchkit/config").Config
  }): RunningProxy => {
    // Seed the live snapshot, then resolve against it on EVERY request: a model/provider added or
    // edited in the GUI (persisted via `config.save`, which updates `liveConfig` above) is picked up
    // by the already-running proxy with no restart. Falls back to the start-time config defensively.
    liveConfig = opts.config
    const getConfig = (): import("@launchkit/config").Config =>
      liveConfig ?? opts.config
    return startProxy({
      host: opts.host,
      port: opts.port,
      proxyKey: opts.proxyKey,
      router: createRouter(getConfig),
      factory,
      gateway,
      listModels: () => getConfig().models.map((m) => String(m.id)),
    })
  }

  // Native folder picker — behind a LAZY dynamic import so bun test never loads native FFI.
  const pickFolder: AppContext["pickFolder"] = async (opts) => {
    const { Utils } = await import("electrobun/bun")
    const paths = await Utils.openFileDialog({
      canChooseDirectory: true,
      canChooseFiles: false,
      allowsMultipleSelection: false,
      ...(opts.startingFolder === undefined
        ? {}
        : { startingFolder: opts.startingFolder }),
    })
    // Empty/cancelled selection comes back as [""] from the comma-split; drop it.
    return paths.filter((p) => p.trim() !== "")
  }

  return {
    config,
    secrets,
    sessions,
    projects,
    registry,
    launch,
    resolveLaunch,
    proxy: { isRunning: isProxyRunning, start: startProxyAdapter },
    factory,
    gateway,
    runtime,
    // tray-and-polish-03: real connectivity probe wired here — resolve the provider from the
    // live config, pick its first model, and delegate to the proxy's createProviderTester.
    testProvider: createTestProvider(config, factory, gateway, () =>
      deps.createSystemClock(),
    ),
    listProviderModels: createListProviderModels(config, secrets),
    proxyPort,
    proxyBaseUrl,
    genProxyKey: deps.genProxyKey,
    terminal,
    terminalSocketUrl,
    runner,
    runnerSocketUrl,
    runEvents: { read: runStore.read },
    driverRegistry,
    pickFolder,
    readScrollback: scrollbackStore.read,
    paths: { configFile, dbFile, harnessDir },
  }
}
