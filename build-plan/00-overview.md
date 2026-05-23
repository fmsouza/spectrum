# 00 — Overview

## What we're building

LaunchKit is a single Electrobun binary that runs in **two modes**:

- **CLI mode** — `launch claude --model deepseek`, `list`, `add`, `remove`. No window. The proxy starts ephemerally (or reuses a running one).
- **GUI mode** — a WebKit webview (React) for managing providers, harnesses, routing aliases, and session history. The proxy runs as a persistent background server while the app is open.

Both modes talk through the **same proxy server**. The proxy receives requests from coding-agent harnesses (Claude Code, Codex, opencode, …) in either the Anthropic or OpenAI wire format, resolves a model **alias** to a concrete provider + model, and streams the response back via the **Vercel AI SDK** (`ai` + `@ai-sdk/*`). The AI SDK is the entire provider layer — no LiteLLM, no bundled Python.

```
harness ──HTTP──► proxy (localhost:4000) ──► alias→provider lookup ──► AI SDK provider ──► cloud LLM
                    │                                                    (Anthropic/OpenAI/
                    └── streams response back in the harness's wire format  Gemini/Bedrock/…)
```

## Architecture recap

- **Proxy** (`packages/proxy`) — `Bun.serve()` on loopback. Endpoints: `/v1/messages` (Anthropic), `/v1/chat/completions` (OpenAI), `/v1/models` (alias discovery), `/health`. Inbound adapters parse the wire format into a normalized internal request; the router resolves the alias; the provider factory instantiates the right AI SDK model; `streamText()` runs uniformly; an outbound serializer streams back in the harness's expected format.
- **Harnesses** (`packages/harnesses`) — declarative `HarnessDefinition` objects with an `envTemplate` (`{{proxyUrl}}`, `{{proxyKey}}`, `{{model}}`). Built-ins ship in code; user-defined ones are JSON files merged at startup. The launcher fills the template and spawns the process.
- **Config** (`packages/config`) — `~/.config/launchkit/config.json` (providers, aliases, settings) with versioned migrations and atomic writes. Secrets are **not** in this file (see security).
- **Secrets** (`packages/secrets`) — API keys live in the macOS Keychain; config stores only a reference.
- **Sessions** (`packages/sessions`) — `bun:sqlite` history of launched harness instances.
- **CLI** (`packages/cli`) — argv parsing + commands, orchestrating the above.
- **GUI** (`apps/desktop`) — Electrobun main process (window, tray, IPC handlers) + a React webview composed from the `packages/ui` atomic design system, talking over the typed `packages/ipc` contract.

## Core type system

Everything flows from four types, defined authoritatively in `packages/types` (with zod schemas). Their exact shapes are pinned in [`04-plans/01-types.md`](04-plans/01-types.md):

- `Provider` — an LLM API endpoint backed by a specific `@ai-sdk/*` package (`sdkProvider`), plus its config and known models.
- `ModelAlias` — a stable name harnesses use (`default`, `fast`, `smart`, `local`), mapped to `(providerId, providerModel)`.
- `HarnessDefinition` — how to launch a coding-agent tool: command, `apiFormat`, `envTemplate`, `defaultAlias`, `builtIn`.
- `Session` — one launched harness instance: harness, alias, timestamps, exit code.

Keep these stable — they are the schema for config persistence, IPC messages, and the proxy routing table.

## Locked decisions

| Topic | Decision |
|---|---|
| Deliverable of the *plan* | Plans only; agents scaffold the repo as task #1 (`phase0`) |
| Runtime | Bun + Electrobun |
| Language | TypeScript only, strict, explicit input/output types on every function |
| Style | Functional: pure functions, `Result<T,E>` over throwing, effects behind injected adapters |
| Test runner | `bun test` with the Jest API (`describe`/`it`/`expect`) |
| Test naming | `it("does X when Y happens")` |
| GUI | React in the WebKit webview |
| Atomic design | Strict for the React UI; functional layering for backend packages |
| Repo shape | Monorepo: Bun workspaces + Turborepo |
| Lint/format | Biome |
| Validation | Zod for all runtime/boundary validation |
| Secrets | macOS Keychain via `packages/secrets`; config stores only a reference |
| Execution model | Progress ledger + per-package TDD plans + canonical resume prompt |

## Build order (dependency DAG)

```
types → utils → {secrets, ipc, ui} → {config, sessions} → {proxy, harnesses} → cli → desktop
```

Braced groups are independent and may be implemented by parallel subagents. The full edge list is in [`02-monorepo/boundaries.md`](02-monorepo/boundaries.md).

## Non-goals (do not build speculatively)

- No bundled Ollama or other binaries — users bring their own installs.
- No chat UI — harnesses own their own terminal output; LaunchKit only tracks sessions.
- No auth / multi-user — single-user local tool.
- No auto-update in v1.
