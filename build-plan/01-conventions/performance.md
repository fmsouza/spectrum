# Convention — Performance ("optimal")

Performance is a first-class requirement. The proxy hot path and CLI cold-start are the two budgets that matter most.

## Proxy hot path (highest priority)

- **Stream, never buffer.** Pipe the AI SDK output stream straight to the HTTP response. Never accumulate a full response body in memory before sending. Use `ReadableStream`/SSE end-to-end.
- **No per-request provider construction.** Memoize AI SDK provider instances in a cache keyed by a hash of `(sdkProvider, resolved config)`. `createAnthropic(...)` etc. run once per distinct config, not per request. The cache is created by a factory (no global mutable singleton); invalidate on config change.
- **Minimal allocation/copy per request.** Parse only what routing needs up front; avoid re-serializing the whole payload. Reuse buffers where the SDK allows.
- **Cheap routing.** Alias→provider lookup is an in-memory map built from config, refreshed on config change — not recomputed per request.
- **`/health` is trivially cheap** (no allocation beyond a static response) since CLI mode polls it on every invocation.

## Startup

- **Lazy-load provider packages.** `@ai-sdk/*` packages are loaded via dynamic `import()` only for providers the user has actually configured. Startup must not eagerly import the entire SDK matrix.
- **CLI fast path.** In CLI mode, never construct the GUI window or tray. Before starting a proxy, do a fast `/health` check against `localhost:4000`; if a GUI-hosted proxy is already running, reuse it (no double-start).
- Defer non-critical subsystem init (e.g. sessions DB) until first use in CLI mode.

## GUI

- **Per-page code splitting** (lazy routes) so the initial webview bundle is small.
- **Virtualize long lists** (session history) — render only visible rows.
- Keep the dependency budget small; avoid heavy UI libraries. Prefer the in-house atomic components.
- Memoize expensive derived data; avoid unnecessary re-renders (stable callback identities, keyed lists).

## Config & data

- **In-memory config cache** is the read path; disk is read once at startup and on explicit reload. Writes are **debounced** and **atomic**.
- SQLite: prepared statements are created once and reused; queries are indexed (index `sessions.startedAt`, `sessions.harnessId`).

## Build / dev loop

- **Turborepo caching** for `typecheck`, `lint`, `test`, `build` — only changed packages rebuild. Configure correct `inputs`/`outputs` so the cache is sound.
- Package-scoped test runs (`bun run --filter @launchkit/<pkg> test`) keep the inner TDD loop fast.

## Measurement (don't guess)

- Where a budget is claimed, add a lightweight benchmark or timing assertion in an integration test (e.g. proxy first-byte latency with the mock provider, CLI cold-start time). Optimize against measurements, not vibes — but do not micro-optimize past the point tests show a win (YAGNI).
