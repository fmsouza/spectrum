# @spectrum/driver-openclaw

**Responsibility:** OpenClaw Gateway adapter: pure `mapOpenclawEvent` + injected-transport glue, wrapped
by driver-runtime into an `AgentDriver`. **FLAGGED UNVERIFIED** (no binary; `@openclaw/sdk` unreleased).

**Public API (barrel `src/index.ts`):** `createOpenclawDriver`, `mapOpenclawEvent` (+ types
`OpenclawDriverDeps`, `OpenclawMapState`, `OpenClawEvent`, `OpenclawRun`, `OpenclawTransport`,
`OpenclawConnect`).

**Depends on:** `@spectrum/driver-runtime`, `@spectrum/agent-events`, `@spectrum/agent-driver`,
`@spectrum/utils`, `zod`.

**Effects owned:** the OpenClaw Gateway connection — behind the injected `OpenclawTransport` port; never
reached around. No direct fs/net/spawn in this package's logic.

**Local rules:** Types zod-first; `mapOpenclawEvent` is pure + fully fixture-tested; the SDK/WebSocket glue
is unverified-pending-binary; no `any`; no import of the proxy/UI/other drivers.

## Verification status

**UNVERIFIED (pending binary + published SDK).** Every pure/adapter unit is tested (`mapOpenclawEvent` vs
fixtures; the adapter vs a fake transport). The live Gateway transport (`realOpenclawConnect`) is built to
the documented Gateway WS protocol (docs.openclaw.ai/gateway/protocol) but is NOT app-run-verified: OpenClaw
is not installed and `@openclaw/sdk` is not a published npm package. **To verify when a binary is available:**
(1) install + onboard OpenClaw (`openclaw onboard`), start the gateway, note `OPENCLAW_GATEWAY_URL`/token;
(2) implement `realOpenclawConnect` on the real transport — preferred: the published `@openclaw/sdk`
(`new OpenClaw({url,token}).connect()` → `agent.run()` → `run.events()`); fallback: spawn `openclaw acp`
and bridge its JSON-RPC stdio (`initialize`/`newSession`/`prompt`/`cancel`/`session/request_permission`);
(3) app-run smoke: launch the openclaw harness, confirm the native conversation renders, a real
`exec.approval.requested` is answered (round-trips to `exec.approval.resolve`), a sub-agent
(`childSessionKey`) opens in the side pane, and send + interrupt (`run.cancel`) work; (4) reconcile the
recorded `fixtures/openclaw-events.ts` against the real stream and adjust the mapper if the live envelope
differs (e.g. exact `assistant.delta` snapshot vs delta semantics, real `tool.call.completed` status field).
