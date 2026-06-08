# LaunchKit — Agent rules

LaunchKit is a Bun + Electrobun desktop app (CLI + GUI) that proxies coding-agent harnesses to any LLM provider via the Vercel AI SDK. Monorepo: Bun workspaces + Turborepo.

## How to work here
- **Follow the rules and the existing code.** Each package owns its own `CLAUDE.md`; the root file is the global rulebook. For per-package local context (responsibility, public API, owned effects, local invariants) read `packages/<pkg>/CLAUDE.md` or `apps/desktop/CLAUDE.md`.
- **Use your skills.** Always invoke `using-superpowers`, and `test-driven-development` on every task. Use `executing-plans`/`subagent-driven-development`, `verification-before-completion`, and `requesting-code-review` as the protocol describes.
- **Use the project skills** in `.claude/skills/` for LaunchKit-specific workflows (e.g. creating a new internal package).

## Non-negotiable rules
- **TypeScript only, strict.** No `any`. Every function has explicit input and output types.
- **Functional style.** Pure functions; small and single-purpose; effects (fs, net, spawn, sqlite, keychain, clock, random) behind injected adapter interfaces; `Result<T,E>` instead of throwing.
- **TDD always.** `bun test`, Jest API, tests named `it("does X when Y happens")`. RED → GREEN → REFACTOR. Test first, every time.
- **Atomic design for the React UI only**; functional layering for backend packages. Dumb components never fetch — data enters at the page level.
- **Security is optimal.** Secrets in the OS keychain (config stores only a reference); proxy on loopback + per-run key; zod-validate all external input; spawn with arg arrays; parameterized SQL; redact secrets in logs.
- **Performance is optimal.** Stream the proxy (never buffer); cache provider instances; lazy-load `@ai-sdk/*`; fast CLI cold-start.
- **Respect package boundaries.** Import via `@launchkit/<pkg>` only; no deep imports; no cycles.

## Definition of Done (every task)
Test-first (RED observed) → implemented (GREEN) → refactored → `bun run typecheck && bun run lint && bun test` all green → committed with a Conventional-Commits message. If you can't check every box, it's not done.

## Package inventory (partial)
- `@launchkit/sessions` — session history (depends on db, types, utils)
- `@launchkit/projects` — project find-or-create + listing (depends on db, types, utils)
- `@launchkit/agent-events` — canonical event schemas + pure reducer (depends on types, utils; zero IO)

## Project skills
`.claude/skills/launchkit-new-package` — creating a new internal package under `packages/`. Invoke it when it applies.
