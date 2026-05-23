# Convention — Git & Definition of Done

## Commits

- **Conventional Commits**, with the **task ID** in brackets at the end of the subject:
  ```
  feat(proxy): add anthropic inbound adapter [proxy-03]
  test(config): cover migration from v1 to v2 [config-05]
  refactor(utils): extract result combinators [utils-02]
  chore(repo): scaffold bun workspaces + turborepo [phase0-01]
  ```
- Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`, `build`.
- Scope = package short name (`proxy`, `config`, `ui`, `desktop`, `repo`).
- **Commit frequently** — ideally one commit per completed task (the TDD cycle for that task), including the `PROGRESS.md` update in the same commit.
- The working tree is **clean** between tasks. Never leave half-done work uncommitted when marking a task done.

## Branching

- Default branch: `main`.
- Single-agent sequential execution commits directly to `main`.
- For parallel subagent work, the orchestrator may use short-lived per-package branches or git worktrees (superpowers `using-git-worktrees`) and merge after review. Whoever owns `PROGRESS.md` serializes its updates to avoid conflicts.

## Definition of Done (mirror of EXECUTION.md)

A task is `done` only when **all** are true:
- [ ] Failing test written first (RED observed).
- [ ] Implementation passes the test (GREEN), then refactored.
- [ ] Functions typed, pure where possible, effects injected.
- [ ] `bun run typecheck` clean.
- [ ] `bun run lint` (Biome) clean.
- [ ] `bun test` green across the repo.
- [ ] `PROGRESS.md` updated (status + commit SHA).
- [ ] Committed with the task ID.

Never `git commit --no-verify`. Never push secrets — `config.json` contains keychain references only, and `.env*`/`*.local` are git-ignored.
