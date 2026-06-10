# @launchkit/driver-openclaw

**Responsibility:** OpenClaw Gateway adapter: pure `mapOpenclawEvent` + injected-transport glue, wrapped
by driver-runtime into an `AgentDriver`. **FLAGGED UNVERIFIED** (no binary; `@openclaw/sdk` unreleased).

**Public API (barrel `src/index.ts`):** `createOpenclawDriver`, `mapOpenclawEvent` (+ types
`OpenclawDriverDeps`, `OpenclawMapState`, `OpenClawEvent`, `OpenclawRun`, `OpenclawTransport`,
`OpenclawConnect`).

**Depends on:** `@launchkit/driver-runtime`, `@launchkit/agent-events`, `@launchkit/agent-driver`,
`@launchkit/utils`, `zod`.

**Effects owned:** the OpenClaw Gateway connection — behind the injected `OpenclawTransport` port; never
reached around. No direct fs/net/spawn in this package's logic.

**Local rules:** Types zod-first; `mapOpenclawEvent` is pure + fully fixture-tested; the SDK/WebSocket glue
is unverified-pending-binary; no `any`; no import of the proxy/UI/other drivers.
