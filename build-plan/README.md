# LaunchKit — Build Plan

This folder is a complete, self-contained plan for building **LaunchKit** from scratch: a Bun + Electrobun desktop app that is both a CLI launcher (`launch claude --model deepseek`) and a GUI for managing LLM providers, harnesses, routing, and session history.

It is designed so **any agent can be handed the resume prompt below at any time, read the current state, and continue implementation from exactly where the last agent stopped** — until the app is fully built.

---

## 🚀 Resume prompt (paste this to any agent)

> You are implementing **LaunchKit**, a Bun + Electrobun desktop app (CLI + GUI) for managing LLM providers, harnesses, routing, and sessions.
>
> 1. Read `build-plan/EXECUTION.md` (the protocol) and `build-plan/PROGRESS.md` (current state).
> 2. Read `build-plan/00-overview.md` and skim the relevant files in `build-plan/01-conventions/`.
> 3. Invoke your superpowers skills — at minimum `using-superpowers`, `test-driven-development`, `executing-plans` (or `subagent-driven-development` for parallel work), and `verification-before-completion`.
> 4. Pick the **first task in `PROGRESS.md` whose status is `todo` and whose dependencies are all `done`**.
> 5. Open that task's plan file under `build-plan/04-plans/`. Implement it **strictly via TDD**: write the failing test first (named `it("does X when Y happens")`), confirm it fails (RED), write the minimal code to pass (GREEN), then refactor.
> 6. Run the verification gate: `bun run typecheck && bun run lint && bun test`. **All must pass.**
> 7. Update `build-plan/PROGRESS.md`: set the task to `done` and record the commit SHA. Commit with a message referencing the task ID (e.g. `feat(proxy): add anthropic inbound adapter [proxy-03]`).
> 8. Repeat from step 4 until no `todo` tasks remain, or stop and report if you hit a blocker (mark the task `blocked` in `PROGRESS.md` with a one-line reason).
>
> Never skip the failing-test-first step. Never claim a task is done without the verification gate passing. Keep functions pure and small; isolate effects (filesystem, network, spawn, sqlite) behind injected adapters.

---

## 📂 What's in here

| Path | Purpose |
|---|---|
| `README.md` | This file — entry point + resume prompt |
| `00-overview.md` | Vision, architecture recap, locked decisions |
| `01-conventions/` | The rules: TypeScript, functional style, TDD, atomic design, security, performance, git |
| `02-monorepo/` | Workspace layout, package boundaries + dependency DAG, tooling |
| `03-claude-config/` | The exact `CLAUDE.md` files and project skills to create |
| `04-plans/` | One ordered, bite-sized TDD task plan per package/phase |
| `PROGRESS.md` | **The ledger** — every task, its status, dependencies, and completing commit |
| `EXECUTION.md` | The orchestration protocol + definition-of-done |

## 🧭 First time here?

The repository currently contains only this plan and a git repo. **Start with `04-plans/00-phase0-bootstrap.md`** — it scaffolds the monorepo, runs `electrobun init`, and wires the tooling. Everything else builds on it.

The design rationale behind this plan lives in [`../docs/superpowers/specs/2026-05-23-launchkit-build-plan-design.md`](../docs/superpowers/specs/2026-05-23-launchkit-build-plan-design.md).
