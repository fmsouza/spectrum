# @launchkit/driver-runtime

**Responsibility:** the reusable driver core. `createDriver(adapter)` wraps a per-harness `DriverAdapter`
into the locked synchronous `AgentDriver`/`AgentSession` seam — owning the sync↔async start bridge
(startup failure → `runner-finished:"errored"`), the approval bridge, runner-id minting + sub-agent
correlation, outbound command queueing (before the handle exists), and lifecycle/cleanup (`close`).

**Public API (barrel `src/index.ts`):** `AdapterHandle`/`AdapterCtx`/`DriverAdapter` (the adapter SPI);
`createDriver`.

**Depends on:** `@launchkit/agent-driver` (the seam + ports), `@launchkit/agent-events` (CanonicalEvent),
`@launchkit/utils` (Result, IdGen). NO harness SDKs — this package is PURE of harness specifics.

**Effect owned:** none — pure logic. The async adapter start runs via an injected `scheduler`
(defaults to `queueMicrotask`; tests pass `(fn) => fn()`). `idGen` is injected (mints `rnr`/`apr`).

**Local rules:** `AgentSession.onEvent` is SINGLE-SUBSCRIBER (PtyHandle convention) — register once, fan
out inside the one callback; `ctx.emit` drops events when no subscriber is registered yet. `close()`
reaps the handle and is idempotent. The runtime knows only `CanonicalEvent` + the adapter SPI.
