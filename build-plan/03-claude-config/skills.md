# Project skills — specs to create

Create these under `.claude/skills/<name>/SKILL.md` (one folder per skill). They encode **LaunchKit-specific** workflows and deliberately defer to existing superpowers skills for generic process (TDD, planning, review). Created during `phase0` (resume + new-package) and alongside the relevant package (the others).

Each `SKILL.md` has frontmatter (`name`, `description` written for trigger accuracy) + a short body. Keep them tight.

## 1. `launchkit-resume`
**When:** at the start of any LaunchKit implementation session, or when asked to "continue building LaunchKit".
**Body:** Restates the resume protocol: read `build-plan/EXECUTION.md` + `PROGRESS.md`; invoke `using-superpowers`, `test-driven-development`, `executing-plans`/`subagent-driven-development`, `verification-before-completion`; pick the first runnable task; implement via TDD; run the gate; update the ledger; commit; repeat. Points to `build-plan/README.md` for the canonical prompt. This is the single entry point an agent needs.

## 2. `launchkit-new-package`
**When:** creating a new internal package under `packages/`.
**Body:** Checklist: create `packages/<name>/` with `package.json` (`@launchkit/<name>`, `type: module`, exports barrel, `typecheck`+`test` scripts), `tsconfig.json` extending the right `tooling/tsconfig` preset with `references` to deps, `src/index.ts` barrel, a co-located smoke test, and a `CLAUDE.md` from the template. Add it to the DAG in `02-monorepo/boundaries.md` if new. Verify `bun run typecheck`/`lint`/`test` pass.

## 3. `launchkit-add-provider`
**When:** adding support for a new LLM provider (a new `sdkProvider` value).
**Body:** Steps: (1) add the literal to the `Provider.sdkProvider` union + zod enum in `@launchkit/types` (test the schema). (2) add the `@ai-sdk/<x>` dep to `packages/proxy` (pinned) and a lazy `import()` branch in `providers/factory.ts` mapping `sdkProvider → createXxx(config)`; validate that provider's config shape with zod. (3) add a contract/integration test using a mock model. (4) add its known models + config-field metadata for the GUI picker. Emphasize: factory stays a pure mapping; instances are cached by config hash; never eager-import.

## 4. `launchkit-add-harness`
**When:** adding a built-in harness, or documenting the user-JSON harness shape.
**Body:** A `HarnessDefinition` is fully declarative. Steps: add `packages/harnesses/src/builtin/<name>.ts` exporting a typed `HarnessDefinition` (`command`, `apiFormat`, `envTemplate` using only `{{proxyUrl}}`/`{{proxyKey}}`/`{{model}}`, `defaultAlias`, `builtIn: true`); register it in the builtins list; add a test asserting the registry includes it and the launcher renders its env correctly. No launch code needed — the launcher is generic.

## 5. `launchkit-atomic-component`
**When:** adding a React component to `packages/ui`.
**Body:** Decide the atomic level (atom/molecule/organism/template) per `01-conventions/atomic-design.md`. Create `ComponentName.tsx` (explicit `Props` type, pure, presentational, no fetching) + co-located `ComponentName.test.tsx` (RTL on happy-dom, behavior-named `it(...)`). Re-export from the level barrel and package barrel. Data-bearing components belong in pages (`apps/desktop`), not here.

---

**Reused superpowers skills (do not recreate):** `using-superpowers`, `test-driven-development`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `verification-before-completion`, `requesting-code-review`, `dispatching-parallel-agents`, `using-git-worktrees`, `systematic-debugging`.
