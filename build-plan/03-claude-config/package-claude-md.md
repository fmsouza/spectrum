# Per-package `CLAUDE.md` — template + content

Each package gets a short `CLAUDE.md` giving **local** context only (the root file + conventions cover global rules). Created by the package's plan as one of its first tasks.

## Template

```markdown
# @launchkit/<pkg>

**Responsibility:** <one sentence — what this package owns>

**Public API (barrel `src/index.ts`):** <the exported symbols>

**Depends on:** <@launchkit/... packages> (see build-plan/02-monorepo/boundaries.md)

**Effects owned:** <none | keychain | sqlite | process spawn | http server | config file>
— exposed to consumers as injected interfaces; never reached around.

**Local rules:** <package-specific gotchas, patterns, invariants>
```

## Content per package (fill the template)

- **types** — Responsibility: the four core domain types + zod schemas + branded ids. No effects. Local rule: types are derived from zod schemas (`z.infer`); schema is the source of truth.
- **utils** — Responsibility: pure cross-cutting helpers (`Result`, `pipe/flow`, `renderTemplate`, `redactSecrets`, ids) + shared effect interfaces (`Clock`, `IdGen`). No effects of its own. Local rule: everything here is pure or an interface — no concrete IO.
- **secrets** — Responsibility: keychain-backed secret storage. Effect: keychain. Local rule: expose `SecretStore` interface + real adapter + in-memory fake; secrets never logged or returned to the webview.
- **ipc** — Responsibility: the typed GUI↔main contract + (de)serialization. No effects. Local rule: every payload has a zod schema validated on receive; contract mirrors the CRUD list in the architecture doc.
- **ui** — Responsibility: React atomic design system. No effects, no data fetching. Local rule: atoms→organisms are pure/presentational; follow `01-conventions/atomic-design.md`.
- **config** — Responsibility: `config.json` read/write, defaults, migrations. Effect: config file (via injected `FileStore`). Local rule: atomic writes, `0600`, zod-validate on load, versioned migrations; secrets are references only.
- **sessions** — Responsibility: session history. Effect: sqlite (via injected `Database`). Local rule: parameterized statements only; index `startedAt`/`harnessId`.
- **proxy** — Responsibility: HTTP proxy + inbound adapters + router + AI SDK provider factory + outbound serializers. Effect: http server + outbound network (AI SDK). Local rule: **stream, never buffer**; cache provider instances; loopback-only + key-checked; `streamText()` is the uniform call.
- **harnesses** — Responsibility: registry (builtins + user JSON) + launcher. Effect: process spawn + reading harness JSON. Local rule: spawn with arg arrays; validate command + template tokens; registry hot-reloads from disk.
- **cli** — Responsibility: argv parsing + commands orchestrating the other packages. Effect: none directly (receives subsystem deps injected). Local rule: commands are pure functions over injected deps; print via an injected writer for testability.

`apps/desktop` also gets a `CLAUDE.md`: Responsibility = the dual-mode entry + GUI shell (window/tray/IPC handlers) + React pages; it wires real adapters into the packages. Local rule: this is the only place real effects are constructed and injected.
