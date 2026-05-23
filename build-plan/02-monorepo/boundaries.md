# Monorepo — Boundaries & Dependency DAG

## Allowed dependency edges (`package → its dependencies`)

```
types        → (none — foundation)
utils        → types
secrets      → utils
ipc          → types
ui           → types            (prop shapes only; no backend deps)
config       → types, utils, secrets
sessions     → types, utils
proxy        → types, utils, config
harnesses    → types, utils, config
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
types → utils → { secrets, ipc, ui } → { config, sessions } → { proxy, harnesses } → cli → desktop
```

The orchestrator uses this to fan out parallel subagents: once `utils` is `done`, `secrets`/`ipc`/`ui` can proceed concurrently; once `config` is `done`, `proxy`/`harnesses` can proceed concurrently; etc. `apps/desktop` is last (it composes everything).

## Public-API surfaces (high level — exact signatures pinned in each plan)

| Package | Exposes (barrel) |
|---|---|
| `types` | `Provider`, `ModelAlias`, `HarnessDefinition`, `Session` + their zod schemas + branded id types |
| `utils` | `Result`/`ok`/`err` + combinators, `pipe`/`flow`, `renderTemplate`, `redactSecrets`, `makeId`, branded-id constructors, effect interfaces shared cross-cutting (`Clock`, `IdGen`) |
| `secrets` | `SecretStore` interface + `createKeychainSecretStore()` + in-memory fake |
| `ipc` | `IpcContract` (method map types), request/response schemas, `createIpcClient`/`createIpcServer` helpers |
| `ui` | atomic components (atoms→organisms) + templates |
| `config` | `ConfigStore` interface + `createFileConfigStore()`, defaults, migration runner, `ConfigError` |
| `sessions` | `SessionStore` interface + `createSqliteSessionStore()`, `SessionError` |
| `proxy` | `startProxy(deps)` / `isProxyRunning()`, adapters, router, provider factory, `ProxyError` |
| `harnesses` | `createRegistry(deps)`, `launchHarness(deps)`, builtin definitions, `HarnessError` |
| `cli` | `runCli(deps, argv)` + per-command functions, `CliError` |
