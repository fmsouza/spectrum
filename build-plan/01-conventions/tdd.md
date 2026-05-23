# Convention — Test-Driven Development

**Every task is TDD. Write the failing test first. No exceptions.** This complements the superpowers `test-driven-development` skill — invoke it.

## Runner & API

- Runner: **`bun test`** (Bun's built-in runner). No Jest install, no transform — it runs `.ts` directly.
- API: the **Jest-compatible** surface — `describe`, `it`, `expect`, `beforeEach`/`afterEach`, and `mock`/`spyOn` from `bun:test`.
- Import in tests: `import { describe, it, expect } from "bun:test"`.

## Naming (mandatory)

Every test is phrased **`it("does X when Y happens")`** — present-tense behavior, then the trigger condition.

```typescript
describe("resolveAlias", () => {
  it("returns the mapped provider and model when the alias exists", () => { /* … */ })
  it("returns a not-found error when the alias is unknown", () => { /* … */ })
  it("uses the default alias when no alias is given", () => { /* … */ })
})
```

`describe` names the unit under test (function/component). `it` names one observable behavior. One assertion-concept per `it`.

## The loop (RED → GREEN → REFACTOR)

1. **RED** — write one failing test for the next small behavior. Run it. Confirm it fails *for the reason you expect* (not a typo/import error).
2. **GREEN** — write the minimum code to pass. No extra features.
3. **REFACTOR** — clean up with the test green: extract helpers, tighten types, remove duplication.
4. Commit (often).

Never write implementation before its test. Never write a batch of tests and then a batch of code — go behavior by behavior.

## Test placement & structure

- Co-locate: `foo.ts` ↔ `foo.test.ts` in the same directory.
- Arrange–Act–Assert, visually separated.
- **Test behavior, not implementation.** Assert on outputs and observable effects, not on internal calls (except where the contract *is* a call, e.g. "spawns with these args").

## Testing effectful code

Per `functional-style.md`, effects are injected. So:
- **Unit tests** pass in-memory fakes for `FileStore`, `Clock`, `IdGen`, `KeychainStore`, `ProcessSpawner`, `Database`, etc. Fast, deterministic, no real IO.
- **Integration tests** (suffix `*.integration.test.ts`) exercise the real adapter against a temp resource: a temp file/dir for config, an in-memory or temp sqlite db, `Bun.serve` on port `0` (ephemeral), and a **mock AI SDK provider** for the proxy.
- **Contract tests** for proxy adapters assert against captured request/SSE **fixtures** (real Anthropic & OpenAI payloads stored under `__fixtures__/`).

## Bun test specifics

- DOM for React: a preload registers **happy-dom** globally (`bunfig.toml` → `preload`). React components use `@testing-library/react` + `@testing-library/jest-dom` matchers.
- Mocking modules: prefer dependency injection over module mocks. When a module mock is unavoidable, use `mock.module(...)` from `bun:test` and restore in `afterEach`.
- Fake timers: pass an injected `Clock` rather than mocking global time.

## Coverage expectation

Every exported function and every React component has tests for its meaningful behaviors (happy path + each error/edge branch). Coverage is a side effect of TDD, not a target to game — but no exported symbol ships untested.
