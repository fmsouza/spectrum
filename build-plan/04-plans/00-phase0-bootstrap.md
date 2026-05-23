# Phase 0 — Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo toolchain (Bun workspaces + Turborepo + Biome + strict TS + `bun test` with a DOM), initialize the Electrobun app shell, add the root `CLAUDE.md` and the resume/new-package skills, and prove the full verification gate runs green on an empty scaffold.

**Architecture:** A Bun-workspaces monorepo with `apps/desktop` (Electrobun) and `packages/*` + `tooling/*`. Turborepo orchestrates `build`/`typecheck`/`test`/`lint` with caching. Tests run on Bun's Jest-compatible runner with happy-dom for React. Git is already initialized (the build plan is committed).

**Tech Stack:** Bun, Electrobun, Turborepo, Biome, TypeScript (strict), happy-dom, @testing-library/react.

> Read first: `build-plan/02-monorepo/layout.md`, `boundaries.md`, `tooling.md`; `build-plan/01-conventions/*`; `build-plan/03-claude-config/*`.
> **Electrobun note:** confirm the exact `electrobun` CLI command and `electrobun.config.ts` schema against current Electrobun docs at implementation time (use the context7 MCP or fetch the docs). This plan pins the *intended end state*; adapt the precise API to match the installed version. If it diverges materially, mark `phase0-05` `blocked` and report.

---

### Task phase0-01: Root workspace + tooling presets

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `tsconfig.json`, `turbo.json`, `biome.json`, `bunfig.toml`
- Create: `tooling/tsconfig/package.json`, `tooling/tsconfig/base.json`, `tooling/tsconfig/lib.json`, `tooling/tsconfig/react.json`
- Create: `tooling/biome-config/package.json`, `tooling/biome-config/biome.json`

- [ ] **Step 1: Create the root `package.json`**

```jsonc
{
  "name": "launchkit-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*", "tooling/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "bun test",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "turbo": "latest",
    "@biomejs/biome": "latest",
    "typescript": "latest",
    "@types/bun": "latest",
    "happy-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/jest-dom": "latest"
  }
}
```
> After install, replace each `"latest"` with the resolved exact version (no `^`) so `bun.lock` pins everything. `test` runs `bun test` at the root (Bun discovers all `*.test.ts` across workspaces); `turbo run test` is also available for cache-aware per-package runs.

- [ ] **Step 2: Create `tsconfig.base.json`** — copy the compiler options block from `build-plan/01-conventions/typescript.md` verbatim.

- [ ] **Step 3: Create the `tooling/tsconfig` presets**

`tooling/tsconfig/package.json`:
```json
{ "name": "@launchkit/tsconfig", "version": "0.0.0", "private": true, "files": ["base.json", "lib.json", "react.json"] }
```
`tooling/tsconfig/base.json`: re-exports the root base (`{ "extends": "../../tsconfig.base.json" }`).
`tooling/tsconfig/lib.json`:
```json
{ "extends": "./base.json", "compilerOptions": { "composite": true, "rootDir": "src", "outDir": "dist" } }
```
`tooling/tsconfig/react.json`:
```json
{ "extends": "./lib.json", "compilerOptions": { "jsx": "react-jsx", "lib": ["ESNext", "DOM", "DOM.Iterable"] } }
```

- [ ] **Step 4: Create `tooling/biome-config`** (`package.json` named `@launchkit/biome-config` + a `biome.json` preset) and a root `biome.json` that `extends` it. Enable as errors: `suspicious/noExplicitAny`, `style/useImportType`, `correctness/noUnusedVariables`, `correctness/noUnusedImports`. Formatter: 2-space, double quotes, trailing commas `all`. (See `build-plan/02-monorepo/tooling.md`.)

- [ ] **Step 5: Create `turbo.json`** — copy the pipeline from `build-plan/02-monorepo/tooling.md`.

- [ ] **Step 6: Create root `tsconfig.json`** (solution file): `{ "files": [], "references": [] }` — references get appended as packages are created.

- [ ] **Step 7: Install and verify tooling runs**

Run: `bun install`
Expected: completes, creates `bun.lock`, `node_modules/`.

Run: `bun run lint`
Expected: Biome runs and reports "Checked N files" with no errors (no source yet).

- [ ] **Step 8: Pin versions + commit**

Edit `package.json` replacing `"latest"` with resolved exact versions. Run `bun install` again.
```bash
git add -A
git commit -m "chore(repo): scaffold bun workspaces + turborepo + biome + tsconfig [phase0-01]"
```

---

### Task phase0-02: `bun test` + DOM smoke test (first RED→GREEN)

**Files:**
- Create: `test/setup.ts`
- Create: `packages/sentinel/package.json`, `packages/sentinel/tsconfig.json`, `packages/sentinel/src/index.ts`
- Test: `packages/sentinel/src/index.test.ts`, `packages/sentinel/src/dom.test.tsx`

> `sentinel` is a throwaway package proving the toolchain (plain test + DOM test) works end to end. It is deleted at the end of phase 0 once a real package exists, OR kept as `packages/utils` is created — your call; the plan deletes it in `phase0-06`.

- [ ] **Step 1: Create `test/setup.ts`** (referenced by `bunfig.toml` preload)

```typescript
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterEach, expect } from "bun:test"
import * as matchers from "@testing-library/jest-dom/matchers"
import { cleanup } from "@testing-library/react"

GlobalRegistrator.register()
expect.extend(matchers)
afterEach(() => cleanup())
```
> Add `@happy-dom/global-registrator` to root devDeps if it is a separate package from `happy-dom` in the installed version; otherwise import from `happy-dom`. Confirm the exact import path.

- [ ] **Step 2: Create `bunfig.toml`**

```toml
[test]
preload = ["./test/setup.ts"]
```

- [ ] **Step 3: Create the `sentinel` package** (`package.json` `@launchkit/sentinel`, `type: module`, exports `./src/index.ts`, `tsconfig.json` extends `@launchkit/tsconfig/lib.json`, empty `src/index.ts`).

- [ ] **Step 4: Write the failing plain test**

`packages/sentinel/src/index.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { ping } from "./index"

describe("ping", () => {
  it("returns 'pong' when called", () => {
    expect(ping()).toBe("pong")
  })
})
```

- [ ] **Step 5: Run it, expect RED**

Run: `bun test packages/sentinel`
Expected: FAIL — `ping` is not exported / not a function.

- [ ] **Step 6: Implement minimally**

`packages/sentinel/src/index.ts`:
```typescript
export const ping = (): string => "pong"
```

- [ ] **Step 7: Run, expect GREEN**

Run: `bun test packages/sentinel`
Expected: PASS, 1 test.

- [ ] **Step 8: Write the failing DOM test**

`packages/sentinel/src/dom.test.tsx`:
```typescript
import { describe, it, expect } from "bun:test"
import { render, screen } from "@testing-library/react"

const Hello = (): JSX.Element => <h1>hello</h1>

describe("DOM test harness", () => {
  it("renders a React element into a document when happy-dom is registered", () => {
    render(<Hello />)
    expect(screen.getByRole("heading", { name: "hello" })).toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Run, expect GREEN**

Run: `bun test packages/sentinel`
Expected: PASS, 2 tests. (If RED with "document is not defined", the preload/registration is wrong — fix `test/setup.ts`.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test(repo): prove bun test runner + happy-dom via sentinel package [phase0-02]"
```

---

### Task phase0-03: Root `CLAUDE.md` + resume/new-package skills

**Files:**
- Create: `CLAUDE.md`
- Create: `.claude/skills/launchkit-resume/SKILL.md`
- Create: `.claude/skills/launchkit-new-package/SKILL.md`

- [ ] **Step 1: Create `/CLAUDE.md`** — copy the content block from `build-plan/03-claude-config/root-claude-md.md` verbatim.

- [ ] **Step 2: Create `launchkit-resume` skill** — `SKILL.md` with frontmatter (`name: launchkit-resume`, a `description` that triggers on "continue/resume building LaunchKit" and at session start) and the body from `build-plan/03-claude-config/skills.md` §1.

- [ ] **Step 3: Create `launchkit-new-package` skill** — from `skills.md` §2.

- [ ] **Step 4: Verify the gate is unaffected**

Run: `bun run lint && bun test`
Expected: both pass (markdown isn't linted as code; tests unchanged at 2).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(repo): add root CLAUDE.md + resume/new-package skills [phase0-03]"
```

---

### Task phase0-04: Initialize the Electrobun app shell

**Files:**
- Create: `apps/desktop/` (via `electrobun` init, then adapted), incl. `apps/desktop/package.json`, `apps/desktop/electrobun.config.ts`, `apps/desktop/src/main.ts`, `apps/desktop/views/main/index.html`
- Test: `apps/desktop/src/detect-mode.test.ts`, `apps/desktop/src/detect-mode.ts`

> Confirm Electrobun's current init command + config schema from its docs first.

- [ ] **Step 1: Initialize Electrobun into `apps/desktop`**

Run the documented Electrobun init (e.g. `bunx electrobun init` in `apps/desktop`, or scaffold manually per docs). Then:
- set `apps/desktop/package.json` name to `launchkit` (this is the user-facing binary), `type: module`, deps `"@launchkit/*": "workspace:*"` (added as those packages exist), `electrobun` pinned;
- point `electrobun.config.ts` entry at `src/main.ts` and the view at `views/main`.

- [ ] **Step 2: Write the failing dual-mode detection test** (the one piece of phase0 app logic worth TDD-ing)

`apps/desktop/src/detect-mode.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { detectMode } from "./detect-mode"

describe("detectMode", () => {
  it("returns 'cli' when argv contains a known subcommand", () => {
    expect(detectMode(["bun", "main.ts", "launch", "claude"])).toBe("cli")
  })
  it("returns 'gui' when argv has no subcommand", () => {
    expect(detectMode(["bun", "main.ts"])).toBe("gui")
  })
  it("returns 'cli' for each known verb (launch/list/add/remove)", () => {
    for (const verb of ["launch", "list", "add", "remove"]) {
      expect(detectMode(["bun", "main.ts", verb])).toBe("cli")
    }
  })
})
```

- [ ] **Step 3: Run, expect RED**

Run: `bun test apps/desktop`
Expected: FAIL — `detectMode` not found.

- [ ] **Step 4: Implement `detect-mode.ts`**

```typescript
export type AppMode = "cli" | "gui"

const CLI_VERBS = ["launch", "list", "add", "remove"] as const

export const detectMode = (argv: readonly string[]): AppMode => {
  const first = argv[2]
  return first !== undefined && (CLI_VERBS as readonly string[]).includes(first)
    ? "cli"
    : "gui"
}
```

- [ ] **Step 5: Run, expect GREEN**

Run: `bun test apps/desktop`
Expected: PASS.

- [ ] **Step 6: Minimal `main.ts`** that compiles and uses `detectMode` (stubs for now; real wiring is `11-desktop-shell.md`):

```typescript
import { detectMode } from "./detect-mode"

const mode = detectMode(process.argv)
if (mode === "cli") {
  // TODO[cli-plan]: parse argv + run command, then exit
  console.log("cli mode")
} else {
  // TODO[desktop-shell]: start proxy + open window
  console.log("gui mode")
}
```
> These TODOs reference later plans by ID and are acceptable scaffolding markers, not plan placeholders.

- [ ] **Step 7: Verify the app builds**

Run the documented Electrobun build (e.g. `bunx electrobun build` in `apps/desktop`).
Expected: a build artifact is produced with no errors. If the API differs, adapt; if it cannot build, mark `blocked` and report.

- [ ] **Step 8: Add `apps/desktop` to root `tsconfig.json` references; commit**

```bash
git add -A
git commit -m "feat(desktop): initialize electrobun shell + dual-mode detection [phase0-04]"
```

---

### Task phase0-05: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun test
      - run: bun audit
```
> macOS-only steps (keychain, electrobun packaging) are not run in CI here; unit/integration tests use the in-memory keychain fake. Add a `macos-latest` job later if packaging needs verifying.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci(repo): add typecheck/lint/test/audit workflow [phase0-05]"
```

---

### Task phase0-06: Green-gate verification + cleanup

- [ ] **Step 1: Remove the sentinel package**

Delete `packages/sentinel/` and its reference from root `tsconfig.json`. (Its job — proving the runner + DOM — is done; real packages follow.)

- [ ] **Step 2: Run the full gate**

Run: `bun run typecheck && bun run lint && bun test`
Expected: typecheck clean; lint clean; tests pass (only `detect-mode` tests remain, plus any kept).
> If `bun test` reports "0 tests" after removing sentinel and that's the only suite, that's fine — `detect-mode` tests should still run.

- [ ] **Step 3: Update `PROGRESS.md`** — mark phase0-01..06 `done` with commit SHAs.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(repo): finalize phase 0 bootstrap, remove sentinel [phase0-06]"
```

**End state:** a green monorepo with the toolchain proven, the Electrobun shell building, root `CLAUDE.md` + 2 skills in place, and CI configured. Ready for `01-types.md`.
