# @launchkit/driver-opencode

**Responsibility:** the OpenCode server adapter — a PURE `mapOpencodeEvent` + injected-transport glue
(`opencode serve` + `@opencode-ai/sdk`, the GLOBAL SSE bus filtered by `sessionID`), wrapped by
`@launchkit/driver-runtime` into an `AgentDriver`. Creates a session, subscribes the server-wide event
stream, maps each in-scope event to canonical events, bridges `permission.updated` through
`ctx.requestApproval` (reply `once`/`always`/`reject`), and tears the server down on close.

**Public API (barrel `src/index.ts`):** `createOpencodeDriver(deps)`; the PURE `mapOpencodeEvent` +
`newOpencodeMapState` + `OpencodeMapState` (for tests); the injected transport port types
(`OpencodeEvent`, `OpencodeClient`, `OpencodeServer`, `OpencodeConnect`, `OpencodeConnectConfig`).

**Depends on:** `@launchkit/driver-runtime`, `@launchkit/agent-events`, `@launchkit/agent-driver`,
`@launchkit/utils`, `@opencode-ai/sdk`, `zod`. Does NOT import other driver packages, the proxy, or the UI.

**Effect owned:** the `opencode serve` process + HTTP/SSE connection — behind the injected
`OpencodeConnect` port; never reached around. No direct fs/spawn in this package's logic (the SDK owns the
spawn; `@opencode-ai/sdk` is loaded lazily ONLY inside `realOpencodeConnect`).

**Local rules:** types are zod-first; `mapOpencodeEvent` is PURE + fully fixture-tested; the GLOBAL SSE
stream is filtered by `sessionID` (filter client-side, reconcile on reconnect); guard the #6573
subagent-over-REST hang with a watchdog timeout + kill; no `any`; no import of the proxy/UI/other drivers.
