# @launchkit/driver-claude

**Responsibility:** the Claude Code `AgentDriver`. A PURE `mapClaudeMessage` (one `@anthropic-ai/claude-agent-sdk`
`SDKMessage` → 0..n `CanonicalEvent`, given a small mapping state) + thin SDK glue: run `query()` in
streaming-input mode with the proxy `env`, pump its async iterator into `ctx.emit(mapClaudeMessage(...))`,
route `canUseTool` → `ctx.requestApproval`, and map `send`/`interrupt`/`close` onto streaming-input /
`query.interrupt()` / `AbortController.abort()`.

**Public API (barrel `src/index.ts`):** `createClaudeDriver(deps)`; `mapClaudeMessage` + `ClaudeMapState`/
`initialClaudeMapState` (PURE, for tests); the narrow `SdkMessageLike` types.

**Depends on:** `@launchkit/driver-runtime`, `@launchkit/agent-driver`, `@launchkit/agent-events`,
`@launchkit/utils`, and `@anthropic-ai/claude-agent-sdk` (its only harness SDK). Does NOT import other
driver packages, the proxy, or the UI.

**Effect owned:** the live `claude` process — spawned by the SDK's `query()` (`pathToClaudeCodeExecutable`).
The SDK loader is injected (`loadSdk`) so the glue is testable with a fake `query` async-generator; the
PURE mapper needs neither the SDK nor the binary.

**Local rules:** the sub-agent tool is named **`Agent`** (was `Task` pre-CLI-2.1.63) in `tool_use` blocks
but `Task` still appears in `system:init` — match BOTH. A non-null `parent_tool_use_id` attributes a
message to a sub-runner. `mapClaudeMessage` is PURE + deterministic; all glue is verified via the mapping
tests + the app-run smoke.
