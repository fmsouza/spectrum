# EXECUTION — How to build LaunchKit task-by-task

This is the protocol every implementing agent follows. It is intentionally mechanical so that a fresh agent with **no memory of prior sessions** can reconstruct the state and continue safely.

## State model

`PROGRESS.md` is the **single source of truth**. Git history is the audit trail. Nothing else tracks state — if it isn't in `PROGRESS.md`, it isn't done.

Each task has:
- a stable **task ID**: `<package>-NN` (e.g. `types-01`, `proxy-03`, `phase0-02`);
- a **status**: `todo` → `in-progress` → `done` (or `blocked`);
- a **dependency list** (other task IDs);
- a **completing commit SHA** (filled in when `done`).

A task is **runnable** when its status is `todo` and **every** dependency task is `done`.

## The loop (single agent)

1. **Read state.** Open `PROGRESS.md`. Find the first runnable task (top-to-bottom order).
2. **Load the plan.** Open that task's section in its `04-plans/*.md` file. Read it fully before writing anything.
3. **Mark in-progress.** Set the task to `in-progress` in `PROGRESS.md` (prevents a parallel agent from grabbing it).
4. **TDD.** Implement strictly per `01-conventions/tdd.md` and the superpowers `test-driven-development` skill:
   - Write the failing test(s) first — named `it("does X when Y happens")`.
   - Run the test; confirm it fails for the **right reason** (RED).
   - Write the minimal code to pass (GREEN).
   - Refactor with tests green; keep functions pure and small.
5. **Verify (the gate).** Run, from the repo root:
   ```bash
   bun run typecheck && bun run lint && bun test
   ```
   All three must pass. For tasks scoped to one package you may run the package-scoped equivalents first (`bun run --filter <pkg> ...`), but the full gate must pass before the task is `done`.
6. **Record + commit.** Set the task to `done` in `PROGRESS.md` and fill in the commit SHA. Commit per `01-conventions/git.md`:
   ```bash
   git add -A
   git commit -m "feat(<pkg>): <what> [<task-id>]"
   ```
   (The commit includes the `PROGRESS.md` update.)
7. **Repeat** from step 1 until no runnable tasks remain.

## Definition of Done (per task)

A task is `done` **only** when all of these are true:
- [ ] Tests were written **before** the implementation (RED observed).
- [ ] The behavior is implemented and its tests pass (GREEN).
- [ ] Code was refactored; functions are pure where possible, effects are behind injected adapters, signatures are explicitly typed.
- [ ] `bun run typecheck` passes (no `any`, no errors).
- [ ] `bun run lint` (Biome) passes.
- [ ] `bun test` passes for the whole repo.
- [ ] `PROGRESS.md` is updated (status `done` + commit SHA).
- [ ] Work is committed with the task ID in the message.

If you cannot truthfully check every box, the task is not done. Do not claim completion. (See superpowers `verification-before-completion`.)

## Parallel execution (orchestrator + subagents)

When multiple tasks are runnable in **independent** packages (per the DAG in `02-monorepo/boundaries.md`), an orchestrator agent may fan them out:

1. Compute the runnable set from `PROGRESS.md`.
2. Group by package; pick tasks from packages with no pending edges between them.
3. Dispatch one **fresh subagent per task** using superpowers `subagent-driven-development` / `dispatching-parallel-agents`. Give each subagent: the task ID, its plan file path, the relevant `01-conventions/*`, and the locked type/contract references.
4. **Two-stage review** each returned result (superpowers `requesting-code-review`): (a) does it meet the task's acceptance criteria and the conventions? (b) run the full verification gate on the merged result.
5. Only after review passes does the orchestrator mark the task `done` and commit. The orchestrator owns `PROGRESS.md` writes to avoid conflicts.

**Never** let two agents edit the same package's files concurrently. Independence is defined by the DAG, not by guesswork.

## Blockers

If a task cannot be completed (missing decision, external dependency, contradictory spec):
1. Set its status to `blocked` in `PROGRESS.md` with a one-line reason (`blocked: electrobun tray API unclear`).
2. Skip to the next runnable task if one exists.
3. If nothing is runnable, stop and report the blocker(s) to the user with specifics.

Do **not** invent requirements to unblock yourself. Do **not** silently change the spec. Surface it.

## Required superpowers skills

- `using-superpowers` — at session start.
- `test-driven-development` — every task.
- `executing-plans` (single-agent) or `subagent-driven-development` (orchestrator) — to drive the plan.
- `verification-before-completion` — before marking anything done.
- `requesting-code-review` — when reviewing subagent output.
- `dispatching-parallel-agents` — when fanning out independent tasks.

## Quick reference: verification commands

| Command | What it checks |
|---|---|
| `bun run typecheck` | `tsc --noEmit` across all packages (strict) |
| `bun run lint` | Biome lint + format check |
| `bun test` | All `*.test.ts` across the repo |
| `bun run build` | Turborepo build of all packages + the desktop app |
| `bun run --filter @launchkit/<pkg> test` | Tests for one package only (fast inner loop) |
