# @launchkit/driver-codex

**Responsibility:** the Codex `AgentDriver`. A PURE `mapCodexEvent` (one `codex app-server`
`ServerNotification` → 0..n `CanonicalEvent`, given a small mapping state) + thin JSON-RPC/stdio glue:
spawn `codex app-server`, run the `initialize`→`initialized`→`thread/start` handshake, pump
notifications into `ctx.emit(mapCodexEvent(...))`, answer server→client approval **requests**
(`item/commandExecution/requestApproval` / `item/fileChange/requestApproval`) via `ctx.requestApproval`,
and map `send`/`interrupt`/`close` onto `turn/start`|`turn/steer` / `turn/interrupt` / process-kill.

**Public API (barrel `src/index.ts`):** `createCodexDriver(deps)`; the PURE `mapCodexEvent` +
`CodexMapState` (for tests); `CODEX_APP_SERVER_VERSION`; the `JsonRpcTransport` SPI +
`createStdioJsonRpcTransport`.

**Depends on:** `@launchkit/driver-runtime`, `@launchkit/agent-driver`, `@launchkit/agent-events`,
`@launchkit/types`, `@launchkit/utils`. Does NOT import other driver packages, the proxy, or the UI; it
has no harness SDK (it talks raw JSON-RPC to `codex app-server`).

**Effect owned:** the live `codex app-server` process — spawned ONLY behind the injected
`JsonRpcTransport`/`SpawnFn` SPI (the single `Bun.spawn` call site). Tests inject a fake transport; the
PURE mapper needs neither a process nor the binary.

**Local rules:** app-server bindings are pinned to `CODEX_APP_SERVER_VERSION` and checked in under
`src/bindings/**` (generated artifacts — do not hand-edit; the `protocol.test.ts` drift tripwire guards the
method strings). app-server is `[experimental]`: unknown/unsupported item types and methods are handled
defensively (the mapper returns `[]`; unsupported server requests get a JSON-RPC error so the server is not
left hanging). `baseEnv` (default `process.env`) is merged UNDER `input.env` so the spawned process inherits
`PATH`/`HOME` while the per-run proxy vars win.
