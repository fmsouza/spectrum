# @spectrum/driver-opencode

**Responsibility:** the OpenCode server adapter — a PURE `mapOpencodeEvent` + injected-transport glue
(`opencode serve` + `@opencode-ai/sdk`, the GLOBAL SSE bus filtered by `sessionID`), wrapped by
`@spectrum/driver-runtime` into an `AgentDriver`. Creates a session, subscribes the server-wide event
stream, maps each in-scope event to canonical events, bridges `permission.updated` through
`ctx.requestApproval` (reply `once`/`always`/`reject`), and tears the server down on close.

**Public API (barrel `src/index.ts`):** `createOpencodeDriver(deps)`; the PURE `mapOpencodeEvent` +
`newOpencodeMapState` + `OpencodeMapState` (for tests); the injected transport port types
(`OpencodeEvent`, `OpencodeClient`, `OpencodeServer`, `OpencodeConnect`, `OpencodeConnectConfig`);
`OPENCODE_SUPPORTED_MODES` (manual / plan / bypass — auto-edits is deferred because
`permission.updated` has no verified edit discriminator). Plan mode sends prompts with `agent: "plan"`;
bypass auto-replies `"always"` to permission requests without bridging to the UI.

**Depends on:** `@spectrum/driver-runtime`, `@spectrum/agent-events`, `@spectrum/agent-driver`,
`@spectrum/utils`, `@opencode-ai/sdk`, `zod`. Does NOT import other driver packages, the proxy, or the UI.

**Effect owned:** the `opencode serve` process + HTTP/SSE connection — behind the injected
`OpencodeConnect` port; never reached around. No direct fs/spawn in this package's logic (the SDK owns the
spawn; `@opencode-ai/sdk` is loaded lazily ONLY inside `realOpencodeConnect`).

**Local rules:** types are zod-first; `mapOpencodeEvent` is PURE + fully fixture-tested; the GLOBAL SSE
stream is filtered by `sessionID` (filter client-side, reconcile on reconnect); guard the #6573
subagent-over-REST hang with a watchdog timeout + kill; no `any`; no import of the proxy/UI/other drivers.
**`mapOpencodeEvent` deliberately emits NO canonical events for `permission.updated`** — the runtime
approval bridge (`ctx.requestApproval` in `driver-runtime`) is the single source of truth for
`approval-requested` events and mints the `apr_*` requestId that `approval-resolved` matches; emitting
here would produce a duplicate dangling card in the UI.

**Verification status (2026-06-10, macOS arm64, opencode 1.16.2 / @opencode-ai/sdk 1.17.3) — VERIFIED
(headless driver smoke):** drove the REAL `createOpencodeDriver` (no fake `connect`), so the live
`@opencode-ai/sdk` connector started a loopback `opencode serve` (`createOpencode`, `port: 0`), created a
session, subscribed the GLOBAL SSE bus, sent a prompt, and the pure mapper translated live events →
canonical. Confirmed: server-start + session-create + global-SSE-subscribe; root `runner-started` flows;
`message.part.updated`(text)→`text-delta`; `session.idle`→`turn-finished`; `session.error`→
`runner-finished:"errored"` (no hang on failure); clean `server.close()` teardown (no orphan process). A
raw-SDK confirmation with an authed free model (`opencode/deepseek-v4-flash-free`) streamed a real
assistant `"PONG"` turn then idle, proving the same wire shapes the mapper consumes. The #6573
subagent-over-REST hang is guarded by the idle watchdog (unit-tested with an injected timer); not triggered
live in this smoke. GUI New-Session click-through + a permission round-trip + a real tool run remain the
manual follow-up. Full write-up in the gitignored `docs/superpowers/MANUAL-VERIFICATION.md`.
