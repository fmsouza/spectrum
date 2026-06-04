import type { ConfigStore } from "@launchkit/config"
import type {
  HarnessError,
  HarnessRegistry,
  LaunchParams,
  ResolvedHarnessLaunch,
} from "@launchkit/harnesses"
import type {
  LanguageModelGateway,
  ProviderFactory,
  RunningProxy,
  RuntimeState,
} from "@launchkit/proxy"
import type { TerminalManager } from "@launchkit/pty"
import type { SecretStore } from "@launchkit/secrets"
import type { SessionStore } from "@launchkit/sessions"
import type { Result } from "@launchkit/utils"

import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  defaultConfig,
} from "@launchkit/config"
import {
  createBunProcessSpawner,
  createDirHarnessFileSource,
  createPathCommandResolver,
  createRegistry,
  launchHarness,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
import {
  createFileRuntimeState,
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
import {
  createBunProcessRunner,
  createMacosSecurityBackend,
  createSecretStore,
} from "@launchkit/secrets"
import {
  createBunSqliteDatabase,
  createSessionStore,
} from "@launchkit/sessions"
import { createCryptoIdGen, createSystemClock } from "@launchkit/utils"
import { err } from "@launchkit/utils"
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
  /** Resolved settings paths (config + db + harness dir), surfaced for diagnostics/tests. */
  readonly paths: {
    readonly configFile: string
    readonly dbFile: string
    readonly harnessDir: string
  }
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
  readonly createFileRuntimeState: typeof createFileRuntimeState
  readonly createFfiPty: typeof createFfiPty
  readonly createTerminalManager: typeof createTerminalManager
  readonly startTerminalSocket: typeof startTerminalSocket
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
  createFileRuntimeState,
  createFfiPty,
  createTerminalManager,
  startTerminalSocket,
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

  // config: cached( file( fs(configFile) ) )
  const config = deps.createCachedConfigStore(
    deps.createFileConfigStore({ file: deps.createFsConfigFile(configFile) }),
  )

  // secrets: store( macOS security backend over a Bun process runner, crypto id gen )
  const secrets = deps.createSecretStore({
    backend: deps.createMacosSecurityBackend({
      runner: deps.createBunProcessRunner(),
    }),
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
  const registry = deps.createRegistry({
    fileSource: deps.createDirHarnessFileSource(harnessDir),
  })
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
  const scrollback = createFileScrollbackStore({
    dir: scrollbackDir,
    fs: createBunScrollbackFs(),
  })
  const terminal = deps.createTerminalManager({
    pty: deps.createFfiPty(),
    sessions: { create: sessions.create, close: sessions.close },
    scrollback,
    send: () => {},
    capBytes: 1_000_000,
    defaultSize: { cols: 80, rows: 24 },
  })
  // The dedicated loopback WebSocket for the PTY byte stream binds `terminal`'s send sink on connect.
  const terminalSocketUrl = deps.startTerminalSocket(terminal).url

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
    proxyPort,
    proxyBaseUrl,
    genProxyKey: deps.genProxyKey,
    terminal,
    terminalSocketUrl,
    paths: { configFile, dbFile, harnessDir },
  }
}
