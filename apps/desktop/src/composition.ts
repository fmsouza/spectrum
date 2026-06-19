import type { ConfigStore } from "@spectrum/config"
import type {
  HarnessError,
  HarnessRegistry,
  LaunchParams,
  ResolvedHarnessLaunch,
} from "@spectrum/harnesses"
import type { ProjectStore } from "@spectrum/projects"
import { createProjectStore } from "@spectrum/projects"
import type {
  LanguageModelGateway,
  ProviderFactory,
  RunningProxy,
  RuntimeState,
} from "@spectrum/proxy"
import type { SecretStore } from "@spectrum/secrets"
import type { SessionStore } from "@spectrum/sessions"
import type { SdkProvider, SessionId } from "@spectrum/types"
import type { Result } from "@spectrum/utils"

import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type {
  AgentDriver,
  RunManager,
  RunnerOutbound,
  SessionSink,
} from "@spectrum/agent-driver"
import {
  createFakeDriver,
  createRunManager,
  demoScript,
} from "@spectrum/agent-driver"
import type { RootRunnerMap, StoredEvent } from "@spectrum/agent-events"
import { isRootRunnerFinished, trackRootRunner } from "@spectrum/agent-events"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  defaultConfig,
} from "@spectrum/config"
import { createDataAdmin } from "@spectrum/data-admin"
import type { DataAdmin } from "@spectrum/data-admin"
import { createSqliteClient, runMigrations } from "@spectrum/db"
import { createClaudeDriver } from "@spectrum/driver-claude"
import { createCodexDriver } from "@spectrum/driver-codex"
import { createOpenclawDriver } from "@spectrum/driver-openclaw"
import { createOpencodeDriver } from "@spectrum/driver-opencode"
import {
  createBunProcessSpawner,
  createInMemoryHarnessFileSource,
  createPathCommandResolver,
  createRegistry,
  launchHarness,
  resolveHarnessLaunch,
} from "@spectrum/harnesses"
import {
  type Logger,
  createConsoleSink,
  createFsLogFileOps,
  createLogger,
  createRotatingFileSink,
  resolveMinLevel,
} from "@spectrum/logger"
import {
  type Platform,
  channelProxyPortOffset,
  detectPlatform,
  legacyLaunchkitDataDir,
  legacyMacosConfigDir,
  resolveAppEnv,
  resolveAppPaths,
  resolveChannel,
} from "@spectrum/platform"
import {
  createDraftProviderTester,
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
} from "@spectrum/proxy"
import { createRunStore } from "@spectrum/run-store"
import {
  createBunProcessRunner,
  createFsSecretFileOps,
  createPlatformKeychainBackend,
  createSecretStore,
} from "@spectrum/secrets"
import { createSessionStore } from "@spectrum/sessions"
import { createCryptoIdGen, createSystemClock } from "@spectrum/utils"
import { err, redactSecrets } from "@spectrum/utils"
import { withDemoHarness } from "./gui/demo-harness"
import {
  DEMO_HARNESS_ID,
  type DriverRegistry,
  createDriverRegistry,
} from "./gui/driver-registry"
import { createNotificationService } from "./gui/notification-service"
import { defaultRelaunch } from "./gui/relaunch"
import { createResetApp } from "./gui/reset-app"
import type { ResetError } from "./gui/reset-app"
import {
  type SessionInfoResolver,
  mapRunFinished,
} from "./gui/run-finished-mapping"
import { withNotifierTap } from "./gui/runner-sink"
import { startRunnerSocket } from "./gui/runner-socket"
import { createElectrobunUpdater } from "./gui/updater/electrobun-updater"
import type { UpdaterAdapter } from "./gui/updater/updater-adapter"
import { isWindowFocused } from "./gui/window"
import {
  migrateLaunchkitToSpectrum,
  migrateLegacyMacosConfig,
} from "./migrate-legacy-config"
import {
  createSecretRegistry,
  withRuntimeKeyRegistration,
  withSecretRegistration,
} from "./secret-registry"

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
   * its proxy env WITHOUT spawning. The GUI native-run path uses this (then hands the result to
   * `ctx.runner.launch`); the headless `ctx.launch` keeps owning the CLI spawn path.
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
      config: import("@spectrum/config").Config
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
  /** Probe connectivity for an UN-SAVED provider from inline config + secret VALUES. */
  readonly testProviderDraft: (input: {
    sdkProvider: SdkProvider
    config: Readonly<Record<string, string>>
    secrets: Readonly<Record<string, string>>
    providerModel: string
  }) => Promise<Result<ProviderTestResult, unknown>>
  /** Discover models for an UN-SAVED provider from inline config + secret VALUES. */
  readonly listProviderModelsDraft: (input: {
    sdkProvider: SdkProvider
    config: Readonly<Record<string, string>>
    secrets: Readonly<Record<string, string>>
  }) => Promise<Result<readonly string[], unknown>>
  /** The configured proxy port (from `config.settings.proxyPort`), surfaced for `getProxyStatus`. */
  readonly proxyPort: number
  /** The loopback proxy base URL (`http://127.0.0.1:<port>`), used by `proxy.isRunning`. */
  readonly proxyBaseUrl: string
  /** Mints the per-run >=32-byte proxy key (security.md) when the shell starts an ephemeral proxy. */
  readonly genProxyKey: () => string
  /**
   * The native run engine: starts an AgentDriver per launched harness and streams its canonical
   * events over a dedicated loopback WebSocket (`runnerSocketUrl`). Its `send` sink is a no-op until the
   * runner socket binds it on connect.
   */
  readonly runner: RunManager
  /** Loopback `ws://localhost:<port>/` the webview connects to for the canonical run-event stream. */
  readonly runnerSocketUrl: string
  /** Read a session's stored canonical event log for read-only replay. */
  readonly runEvents: {
    read(
      id: SessionId,
    ): Result<
      readonly StoredEvent[],
      { readonly kind: "db-failed"; readonly detail: string }
    >
  }
  /** Transactional cascade deletes for sessions and projects. */
  readonly dataAdmin: DataAdmin
  /**
   * Factory reset: delete all keychain secrets, wipe the data dir, and relaunch to a
   * first-launch state. Returns after issuing the relaunch (which may end the process).
   */
  readonly resetApp: () => Promise<Result<void, ResetError>>
  /** Which harnesses have a registered native driver (every launchable harness does). */
  readonly driverRegistry: DriverRegistry
  /** Structured application logger (console + rotating file). Inject child scopes into subsystems. */
  readonly log: Logger
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
   * The injected updater seam. Real apps wire `createElectrobunUpdater()`; tests inject
   * `createFakeUpdater(...)`. IPC handlers call `getRaw()`, `check()`, `startDownload()`,
   * `apply()`, and `setChannel()` through this interface — never through Electrobun directly.
   */
  readonly updater: UpdaterAdapter
}

/**
 * The constructor functions `createAppContext` wires together. Defaulted to the real adapters from
 * each package; a test injects recording stand-ins to assert the wiring shape without touching real
 * fs/keychain/sqlite. This is the only seam that makes a flat, logic-free composition root testable.
 */
export interface CreateAppContextDeps {
  readonly homeDir: typeof homedir
  readonly platform: Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly resolveAppPaths: typeof resolveAppPaths
  /** Create a directory (recursively) — used to materialise the data dir on a fresh install. */
  readonly ensureDir: (dir: string) => void
  readonly migrateLegacyMacosConfig: typeof migrateLegacyMacosConfig
  readonly migrateLaunchkitToSpectrum: typeof migrateLaunchkitToSpectrum
  readonly createFsConfigFile: typeof createFsConfigFile
  readonly createFileConfigStore: typeof createFileConfigStore
  readonly createCachedConfigStore: typeof createCachedConfigStore
  readonly createPlatformKeychainBackend: typeof createPlatformKeychainBackend
  readonly createSecretFileOps: typeof createFsSecretFileOps
  readonly secretPassphrase: () => Promise<string | null>
  readonly createBunProcessRunner: typeof createBunProcessRunner
  readonly createCryptoIdGen: typeof createCryptoIdGen
  readonly createSecretStore: typeof createSecretStore
  readonly createSqliteClient: typeof createSqliteClient
  readonly runMigrations: typeof runMigrations
  readonly createSystemClock: typeof createSystemClock
  readonly createSessionStore: typeof createSessionStore
  readonly createProjectStore: typeof createProjectStore
  readonly createRegistry: typeof createRegistry
  readonly createPathCommandResolver: typeof createPathCommandResolver
  readonly createBunProcessSpawner: typeof createBunProcessSpawner
  readonly launchHarness: typeof launchHarness
  readonly createProviderFactory: typeof createProviderFactory
  readonly loadSdk: typeof loadSdk
  readonly createRealGateway: typeof createRealGateway
  readonly createFileRuntimeState: typeof createFileRuntimeState
  readonly createRunStore: typeof createRunStore
  readonly createRunManager: typeof createRunManager
  readonly startRunnerSocket: typeof startRunnerSocket
  readonly createFakeDriver: typeof createFakeDriver
  readonly createCodexDriver: typeof createCodexDriver
  readonly createOpencodeDriver: typeof createOpencodeDriver
  readonly createDataAdmin: typeof createDataAdmin
  /** Recursively remove a directory (factory reset). */
  readonly removeDir: (dir: string) => void
  /** Relaunch the app process (Electrobun). Defaulted to a lazy native call. */
  readonly relaunch: () => void
  /** Set in dev to register the demo FakeDriver harness; production leaves it unset. */
  readonly demoHarnessEnabled: boolean
  readonly genProxyKey: () => string
  /**
   * Read the bundled `version.json` channel ("dev" | "stable" | "canary") that pins the
   * app environment. Returns undefined when no bundle is present (CLI binary, tests), in
   * which case the ambient SPECTRUM_ENV is used. Effect: reads a file relative to cwd.
   */
  readonly readBuildChannel: () => string | undefined
}

/** >=32-byte base64url per-run proxy key (security.md). The default for production wiring. */
const defaultGenProxyKey = (): string => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

/** Headless passphrase source for the encrypted-file fallback (GUI prompt is a future addition). */
const defaultSecretPassphrase = async (): Promise<string | null> =>
  process.env.SPECTRUM_SECRET_PASSPHRASE ?? null

/** The real constructors, used when `createAppContext()` is called with no argument. */
const realDeps: CreateAppContextDeps = {
  homeDir: homedir,
  platform: detectPlatform(),
  env: process.env,
  resolveAppPaths,
  ensureDir: (dir: string): void => {
    mkdirSync(dir, { recursive: true })
  },
  migrateLegacyMacosConfig,
  migrateLaunchkitToSpectrum,
  createFsConfigFile,
  createFileConfigStore,
  createCachedConfigStore,
  createPlatformKeychainBackend,
  createSecretFileOps: createFsSecretFileOps,
  secretPassphrase: defaultSecretPassphrase,
  createBunProcessRunner,
  createCryptoIdGen,
  createSecretStore,
  createSqliteClient,
  runMigrations,
  createSystemClock,
  createSessionStore,
  createProjectStore,
  createRegistry,
  createPathCommandResolver,
  createBunProcessSpawner,
  launchHarness,
  createProviderFactory,
  loadSdk,
  createRealGateway,
  createFileRuntimeState,
  createRunStore,
  createRunManager,
  startRunnerSocket,
  createFakeDriver,
  createCodexDriver,
  createOpencodeDriver,
  createDataAdmin,
  removeDir: (dir: string): void => {
    rmSync(dir, { recursive: true, force: true })
  },
  relaunch: defaultRelaunch,
  demoHarnessEnabled: process.env.SPECTRUM_DEMO_HARNESS === "1",
  genProxyKey: defaultGenProxyKey,
  // Electrobun runs the Bun process with cwd = <bundle>/Contents/MacOS, so the app's
  // version.json sits at ../Resources/version.json (same path electrobun-updater uses).
  // Any failure (no bundle, unreadable, malformed) yields undefined → ambient-env fallback.
  readBuildChannel: (): string | undefined => {
    try {
      const parsed = JSON.parse(
        readFileSync("../Resources/version.json", "utf8"),
      ) as { channel?: unknown }
      return typeof parsed.channel === "string" ? parsed.channel : undefined
    } catch {
      return undefined
    }
  },
}

/**
 * Build the `testProvider` function that delegates to `@spectrum/proxy`'s
 * `createProviderTester`. Resolves the provider from the live config, picks its
 * first model (falling back to the provider id), and measures connectivity with
 * the already-wired factory + gateway. Extracted so Biome's noUnusedImports
 * rule sees the `err` / `createProviderTester` usage at module scope.
 */
const createTestProvider = (
  config: ConfigStore,
  factory: ProviderFactory,
  gateway: LanguageModelGateway,
  createSystemClock: () => import("@spectrum/utils").Clock,
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
 * Build the `listProviderModels` function that delegates to `@spectrum/proxy`'s
 * `createModelLister`. Resolves the provider from the live config, resolves its apiKey
 * from the keychain (keyless providers like ollama have no secrets — apiKey stays undefined),
 * then calls the lister. The ModelLister is constructed once and closed over.
 * SECURITY: apiKey is resolved from the keychain and passed only to the outbound HTTP request;
 * it is never returned to the view.
 */
const createListProviderModels = (
  config: ConfigStore,
  secrets: import("@spectrum/secrets").SecretStore,
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
 * Draft tester: probe inline values (no config load, no keychain).
 * SECURITY: secret VALUES are inline (caller-supplied, never persisted); used only to build a
 * one-shot probe model and never logged.
 */
const createTestProviderDraft = (
  factory: ProviderFactory,
  gateway: LanguageModelGateway,
  createSystemClock: () => import("@spectrum/utils").Clock,
): AppContext["testProviderDraft"] => {
  return async ({ sdkProvider, config, secrets, providerModel }) => {
    const tester = createDraftProviderTester({
      factory,
      gateway,
      clock: createSystemClock(),
    })
    return tester({ sdkProvider, config, secrets, providerModel })
  }
}

/**
 * Draft model discovery: list models from inline values (no config load, no keychain).
 * SECURITY: apiKey is the inline, caller-supplied value (never from the keychain); it is passed
 * only to the outbound discovery request and is never persisted or logged.
 */
const createListProviderModelsDraft =
  (): AppContext["listProviderModelsDraft"] => {
    const lister = createModelLister({ httpGet: createFetchHttpGet() })
    return async ({ sdkProvider, config, secrets }) => {
      const apiKey = secrets.apiKey
      return lister({
        sdkProvider,
        config,
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
  const buildChannel = deps.readBuildChannel()
  const appEnv = resolveAppEnv({ buildChannel, env: deps.env })
  const channel = resolveChannel({ buildChannel, env: deps.env })

  // Legacy data lived only under the production dirs; never migrate it into a dev sandbox.
  if (appEnv === "production") {
    deps.migrateLegacyMacosConfig({
      platform: deps.platform,
      homeDir: deps.homeDir(),
      env: deps.env,
    })
    deps.migrateLaunchkitToSpectrum({
      platform: deps.platform,
      homeDir: deps.homeDir(),
      env: deps.env,
    })
  }
  const paths = deps.resolveAppPaths({
    platform: deps.platform,
    homeDir: deps.homeDir(),
    env: deps.env,
    appEnv,
    channel,
  })
  const configFile = paths.configFile
  const dbFile = paths.dbFile
  const harnessDir = paths.harnessDir
  const runtimeFile = paths.runtimeFile

  // A fresh install has no data directory yet. Create it BEFORE opening the SQLite DB — otherwise
  // `new Database(dbFile)` throws ("unable to open database file") on the missing parent, which
  // crashes GUI startup before the proxy ever binds (the config/secret stores only mkdir lazily on
  // their first write, which is too late for the db opened here). This is the only startup step that
  // needs the dir to pre-exist.
  deps.ensureDir(paths.dataDir)

  // Defense-in-depth secret registry (spec §6): fed at the secret chokepoints (resolved/written
  // apiKeys via the wrapped secrets store; the minted per-run proxy key below) and read lazily by
  // the logger's `redact` so no record can persist a known secret value.
  const secretRegistry = createSecretRegistry()

  // Wrap the minted per-run proxy key so each value is registered for redaction (it does NOT flow
  // through the secret store, so it must be registered here).
  const genProxyKey = (): string => {
    const key = deps.genProxyKey()
    secretRegistry.register(key)
    return key
  }

  const log = createLogger({
    sinks: [
      createConsoleSink({
        write: (line) => {
          process.stderr.write(line)
        },
        pretty: appEnv === "development",
      }),
      createRotatingFileSink({
        fileOps: createFsLogFileOps(),
        dir: join(paths.dataDir, "logs"),
        maxBytes: 5 * 1024 * 1024,
        maxFiles: 3,
      }),
    ],
    clock: deps.createSystemClock(),
    minLevel: resolveMinLevel(appEnv, deps.env),
    // Defense-in-depth (spec §6): scrub any in-process secret (the per-run proxy key,
    // resolved apiKeys) from every record at log time. Call sites must still never pass
    // raw secrets as fields — this is the backstop, especially for webview-forwarded records.
    redact: (text) => redactSecrets(text, secretRegistry.snapshot()),
  })

  log.info("resolved app environment", {
    appEnv,
    buildChannel: buildChannel ?? "none",
  })

  // config: cached( file( fs(configFile) ) ). Wrapped to keep a synchronous snapshot of the latest
  // config (`liveConfig`) updated on every load/save, so the long-running GUI proxy can resolve
  // against live provider/model changes without an app restart. (The cached store already refreshes
  // its own cache on save; this just exposes that latest value synchronously to the proxy router.)
  const baseConfig = deps.createCachedConfigStore(
    deps.createFileConfigStore({
      file: deps.createFsConfigFile(configFile),
      logger: log.child("config"),
    }),
  )
  let liveConfig: import("@spectrum/config").Config | undefined
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

  // secrets: store( per-OS keychain backend (security / secret-tool / DPAPI-file) over a Bun runner )
  const keychainService = appEnv === "development" ? "spectrum-dev" : "spectrum"
  const secrets = withSecretRegistration(
    deps.createSecretStore({
      backend: deps.createPlatformKeychainBackend({
        platform: deps.platform,
        runner: deps.createBunProcessRunner(),
        fileOps: deps.createSecretFileOps(),
        secretsDir: paths.secretsDir,
        secretPassphrase: deps.secretPassphrase,
        keychainService,
      }),
      idGen: deps.createCryptoIdGen(),
      logger: log.child("secrets"),
    }),
    secretRegistry,
  )

  // sessions: open sqlite at dbFile, apply migrations, then build the store.
  const dbOpen = deps.createSqliteClient(dbFile, { logger: log.child("db") })
  if (!dbOpen.ok) {
    throw new Error(
      `failed to open database at ${dbFile}: ${dbOpen.error.detail}`,
    )
  }
  const dbClient = dbOpen.value
  const migrated = deps.runMigrations(dbClient, { logger: log.child("db") })
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

  // Every launched session must belong to a project. Resolve (or create) the project from the
  // launch cwd, then create the session with its projectId. This is the single GUI orchestration
  // seam — SessionStore.create stays pure (it just receives a projectId).
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

  // harnesses: registry of the builtins only (custom user harnesses are no longer supported, so the
  // file source is empty); launcher partially applied with real adapters.
  const baseRegistry = deps.createRegistry({
    fileSource: createInMemoryHarnessFileSource([]),
  })
  // Dev-only (SPECTRUM_DEMO_HARNESS=1): surface a launchable `demo` harness — driven by the FakeDriver
  // registered in the driver registry below — so the native conversation view is reachable from the New
  // Session modal. Production (flag unset) lists only the builtin harnesses.
  const registry = deps.demoHarnessEnabled
    ? withDemoHarness(baseRegistry)
    : baseRegistry
  // ONE resolver shared by both launch paths: the headless `launch` (CLI spawn) and the GUI's
  // `resolveLaunch` (resolve command + render proxy env, then hand to `runner.launch`).
  const resolver = deps.createPathCommandResolver()
  const launch = deps.launchHarness({
    resolver,
    spawner: deps.createBunProcessSpawner(),
    logger: log.child("harness"),
  })
  const resolveLaunch = resolveHarnessLaunch({ resolver })

  // proxy provider layer: factory (secrets + lazy SDK loader) + real streamText gateway
  const factory = deps.createProviderFactory({
    secretStore: secrets,
    loadSdk: deps.loadSdk,
  })
  const gateway = deps.createRealGateway()

  // runtime: persists only the running proxy's per-run key so the CLI can reuse it. Wrapped so a
  // key RESTORED from persisted state (cross-process / GUI-restart reuse) — not just a freshly
  // minted one — is also registered for redaction, closing that path symmetrically.
  const runtime = withRuntimeKeyRegistration(
    deps.createFileRuntimeState(runtimeFile),
    secretRegistry,
  )

  // Native run path: structured canonical events persisted to the shared db and streamed over a
  // loopback socket. The RunStore structurally satisfies the RunManager's RunEventSink; sessionSink
  // structurally satisfies its SessionSink.
  const runStore = deps.createRunStore({
    db: dbClient,
    clock: deps.createSystemClock(),
  })

  // Native drivers: `claude`, `codex`, `opencode`, `openclaw` all launch native via their drivers
  // (openclaw is UNVERIFIED — no binary). The demo FakeDriver stays dev-gated
  // (SPECTRUM_DEMO_HARNESS=1). Each driver injects its own effects so the logic stays unit-testable;
  // the runtime owns the sync↔async bridge + lifecycle.
  const idGen = deps.createCryptoIdGen()
  const driverIdGen = deps.createCryptoIdGen()
  const driverRegistry: DriverRegistry = createDriverRegistry({
    claude: createClaudeDriver({ idGen, logger: log.child("driver.claude") }),
    codex: deps.createCodexDriver({ idGen: driverIdGen }),
    opencode: deps.createOpencodeDriver({ idGen: driverIdGen }),
    // Plan 4 (UNVERIFIED): OpenClaw gateway driver. No installed binary / published @openclaw/sdk; the
    // real connector throws (→ runner-finished:errored) until wired, but it routes native like the others.
    openclaw: createOpenclawDriver({ idGen }),
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

  // Native run-finished notifications (focus-aware). The notifier only fires when the window is
  // unfocused; `showNotification` lazy-imports Electrobun so `bun test` never loads native FFI, and
  // `isWindowFocused` reads the window focus seam (window.ts). The send sink below taps each
  // `runner-finished:(completed|errored)` frame and hands it to the notifier.
  const notifyLog = log.child("notify")
  const notifier = createNotificationService({
    showNotification: (n) => {
      void import("electrobun/bun").then(({ Utils }) =>
        Utils.showNotification(n),
      )
    },
    isWindowFocused,
  })
  // Resolve a finished session's harness + cwd for the notification body (the frame carries only the
  // sessionId). SessionStore has no by-id read, so query and find — this runs once per finished run.
  const resolveSessionInfo: SessionInfoResolver = (sessionId) => {
    const queried = sessions.query()
    if (!queried.ok) return undefined
    const found = queried.value.find((s) => String(s.id) === sessionId)
    if (found === undefined) return undefined
    return {
      harnessId: String(found.harnessId),
      ...(found.cwd !== undefined ? { cwd: found.cwd } : {}),
    }
  }
  // The run-event send sink: the runner socket rebinds this to the live websocket on connect, but the
  // initial sink taps run-finished frames for native notifications. We wrap so notifications fire
  // regardless of which socket is bound — the manager's `send` is the canonical fan-out point.
  //
  // ROOT-GATING: a multi-agent run emits one `runner-finished` PER runner (each sub-agent AND the
  // root). Only the ROOT finish is a session-end, so we track each session's root runner (the first
  // parentless `runner-started`) and notify ONLY when the finishing runner IS that root. Fail-closed:
  // an unknown root suppresses the notification. The map is updated on EVERY forwarded frame.
  let roots: RootRunnerMap = new Map()
  const notifyOnRunFinished = (message: RunnerOutbound): void => {
    if (message.type === "runner-event") {
      const sessionId = message.id
      const inner = message.event.event
      roots = trackRootRunner(roots, sessionId, inner)
      if (!isRootRunnerFinished(roots, sessionId, inner)) return
    }
    const finished = mapRunFinished(message, resolveSessionInfo)
    if (finished === null) return
    notifyLog.info("run-finished native notification dispatched", {
      sessionId: finished.sessionId,
      harnessId: finished.harnessId,
      status: finished.status,
    })
    notifier.onRunFinished(finished)
  }

  // Re-render a session's proxied route env when the user picks a model in-session. Mirrors the
  // proxied branch of launchHarness: proxy URL from settings, the running proxy's per-run key from
  // runtime (mint one only as a defensive fallback), env rendered via resolveHarnessLaunch.
  // SECURITY: never log the proxy key or the rendered env.
  const resolveModelEnv = async (input: {
    readonly harnessId: import("@spectrum/types").HarnessId
    readonly modelId: import("@spectrum/types").ModelId | null
  }): Promise<Readonly<Record<string, string>>> => {
    if (input.modelId === null) return {} // switch to default/subscription ⇒ direct (no proxy env)
    const loaded = await config.load()
    const cfg = loaded.ok ? loaded.value : defaultConfig()
    const listed = await registry.list()
    const harness = listed.ok
      ? listed.value.find((h) => h.id === input.harnessId)
      : undefined
    if (harness === undefined) return {}
    const proxyUrl = `http://${cfg.settings.proxyHost}:${proxyPort}`
    const proxyKey = (await runtime.readProxyKey()) ?? genProxyKey()
    const resolved = resolveLaunch({
      harness,
      route: {
        kind: "proxied",
        proxyUrl,
        proxyKey,
        modelId: input.modelId,
      },
    })
    return resolved.ok ? resolved.value.env : {}
  }

  const baseRunner = deps.createRunManager({
    driver: routingDriver,
    sessions: sessionSink,
    events: runStore,
    clock: deps.createSystemClock(),
    logger: log.child("runner"),
    // Before the webview socket connects, the manager's sink is this notifier tap.
    send: notifyOnRunFinished,
    resolveModelEnv,
  })
  // The runner socket calls `bindSend` on connect, REPLACING the manager's sink with one that pushes
  // to the live websocket. `withNotifierTap` composes the notifier tap INTO that socket sink —
  // otherwise native notifications would stop the moment the webview connects. Only one sink is ever
  // active, so a frame is never double-notified.
  const runner: RunManager = withNotifierTap(baseRunner, notifyOnRunFinished)
  // The dedicated loopback WebSocket for the run-event stream binds `runner`'s send sink on connect.
  const runnerSocketUrl = deps.startRunnerSocket(runner).url

  // Destructive maintenance + factory reset over the already-wired db/config/secrets. The cascade and
  // reset LOGIC live in @spectrum/data-admin and createResetApp; here we only construct + inject.
  const dataAdmin = deps.createDataAdmin({ db: dbClient })
  const resetApp = createResetApp({
    config,
    secrets,
    closeDb: () => dbClient.connection.close(),
    removeDir: deps.removeDir,
    relaunch: deps.relaunch,
    dataDir: paths.dataDir,
    legacyDirs: [
      legacyMacosConfigDir(deps.homeDir()),
      legacyLaunchkitDataDir({
        platform: deps.platform,
        homeDir: deps.homeDir(),
        env: deps.env,
      }),
    ],
    logger: log.child("reset"),
  })

  // proxy settings resolved from the default config shape (loopback only, security.md)
  const settings = defaultConfig().settings
  const proxyPort = settings.proxyPort + channelProxyPortOffset(channel)
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
    config: import("@spectrum/config").Config
  }): RunningProxy => {
    // Seed the live snapshot, then resolve against it on EVERY request: a model/provider added or
    // edited in the GUI (persisted via `config.save`, which updates `liveConfig` above) is picked up
    // by the already-running proxy with no restart. Falls back to the start-time config defensively.
    liveConfig = opts.config
    const getConfig = (): import("@spectrum/config").Config =>
      liveConfig ?? opts.config
    return startProxy({
      host: opts.host,
      port: opts.port,
      proxyKey: opts.proxyKey,
      router: createRouter(getConfig),
      factory,
      gateway,
      listModels: () => getConfig().models.map((m) => String(m.id)),
      logger: log.child("proxy"),
    })
  }

  // In-app updater: lazy Electrobun engine, real production adapter.
  const updater = createElectrobunUpdater()

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
    testProviderDraft: createTestProviderDraft(factory, gateway, () =>
      deps.createSystemClock(),
    ),
    listProviderModelsDraft: createListProviderModelsDraft(),
    proxyPort,
    proxyBaseUrl,
    genProxyKey,
    runner,
    runnerSocketUrl,
    runEvents: { read: runStore.read },
    dataAdmin,
    resetApp,
    driverRegistry,
    pickFolder,
    updater,
    log,
    paths: { configFile, dbFile, harnessDir },
  }
}
