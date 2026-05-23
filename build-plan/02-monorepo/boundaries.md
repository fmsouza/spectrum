# Monorepo — Boundaries & Dependency DAG

## Allowed dependency edges (`package → its dependencies`)

```
types        → (none — foundation)
utils        → (none — pure toolbox, no internal deps)
secrets      → types, utils
ipc          → types, utils
ui           → types, utils      (prop shapes + formatting only; no backend deps)
config       → types, utils
sessions     → types, utils
harnesses    → types, utils
proxy        → types, utils, config, secrets   (resolves provider config + secret refs)
cli          → types, utils, config, secrets, proxy, harnesses, sessions
apps/desktop → cli, proxy, harnesses, config, sessions, secrets, ipc, ui, types, utils
```

External deps are pinned per package: `proxy` owns `ai` + `@ai-sdk/*`; `config`/`types` own `zod`; `sessions` uses `bun:sqlite` (built-in); `ui`/`desktop` own `react`/`react-dom`; `secrets` owns the keychain dep.

## Rules (enforced in review; ideally by a Biome/`import` boundary rule)

1. **No cycles.** The graph above is a DAG. If you need an edge not listed, that's a design smell — stop and reconsider, or surface it as a blocker.
2. **Import via package name only.** `import { ok } from "@launchkit/utils"` — never `"../../utils/src/result"`. Deep imports are forbidden.
3. **The barrel is the contract.** Only what a package re-exports from `src/index.ts` is public. Internal files are private.
4. **Types flow down, never up.** `types` depends on nothing; everything may depend on `types`.
5. **No backend code in `ui`.** The UI package knows React + prop shapes (from `types`). It never imports `config`, `proxy`, etc. Data reaches it via props from pages, which use `ipc`.
6. **Effects stay in their package.** Only `secrets` touches the keychain; only `sessions` touches sqlite; only `harnesses` spawns processes; only `proxy` opens a server/sockets; only `config` reads/writes `config.json`. Other packages receive these capabilities via injected interfaces (defined in the owning package, re-exported through its barrel).

## Build order & parallelism

Topological order (left to right); braces = independent, parallelizable:

```
{ types, utils } → { secrets, ipc, ui, config, sessions, harnesses } → proxy → cli → desktop
```

The orchestrator uses this to fan out parallel subagents: `types` and `utils` are independent roots; once both are `done`, the entire middle tier (`secrets`, `ipc`, `ui`, `config`, `sessions`, `harnesses`) can proceed **concurrently**; `proxy` follows (it needs `config` + `secrets`); then `cli` (needs `proxy`/`harnesses`/`sessions`/`config`/`secrets`); `apps/desktop` is last (it composes everything).

## Public-API surfaces (high level — exact signatures pinned in each plan)

| Package | Exposes (barrel) |
|---|---|
| `types` | `Provider`, `ModelAlias`, `HarnessDefinition`, `Session` + their zod schemas; branded id types/schemas (`ProviderId`, `AliasName`, `HarnessId`, `SessionId`); `SecretRef` |
| `utils` | `Result`/`ok`/`err` + combinators, `pipe`/`flow`, `renderTemplate`, `redactSecrets`, and the `Clock`/`IdGen` effect interfaces (+ real & in-memory fake adapters) |
| `secrets` | `SecretStore` + `createSecretStore(deps)`; `KeychainBackend` + `createMacosSecurityBackend`/`createInMemoryKeychainBackend`; `ProcessRunner`; `SecretError` |
| `ipc` | `ProviderView` + per-method zod schemas, `IpcMethods` map, `createIpcClient`/`createIpcServer`, transports, `IpcError` |
| `ui` | atomic components (atoms→organisms) + templates |
| `config` | `ConfigStore` + `createFileConfigStore`/`createCachedConfigStore`; `Config`/`ConfigSchema`, `defaultConfig`, `runMigrations`, `ConfigFile`, `ConfigError` |
| `sessions` | `SessionStore` + `createSessionStore(deps)`; `Database` + `createBunSqliteDatabase`/`createInMemoryDatabase`; `SessionInput`, `SessionFilter`, `SessionError` |
| `proxy` | `startProxy(deps)` / `isProxyRunning()`, adapters, router, provider factory, `ProxyError` |
| `harnesses` | `createRegistry(deps)`, `launchHarness(deps)`, builtin definitions, `HarnessError` |
| `cli` | `runCli(deps, argv)` + per-command functions, `CliError` |
