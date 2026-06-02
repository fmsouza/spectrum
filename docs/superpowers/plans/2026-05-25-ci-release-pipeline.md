# CI fix + canary/release pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CI green by fixing all `bun audit` advisories (including a full AI SDK v4→v5 migration), then add canary builds on every merge to `main` and semver releases on `v*` tags — each building both the Electrobun desktop app and a standalone CLI binary across the full platform matrix.

**Architecture:** Three ordered workstreams. (A) sync every workspace version to `0.1.0`. (B) remediate dependencies so `bun audit` exits 0 with no `--ignore` — safe bumps + `overrides` + an AI SDK v4→v5 migration isolated to two files behind the existing `LanguageModelGateway` adapter. (C) add a boundary-correct CLI binary entry in `apps/desktop` (the composition root), keep `bun audit` blocking in `ci.yml`, and add `canary.yml` + `release.yml` mirroring the argon model.

**Tech Stack:** Bun 1.3.14, Turborepo, Biome, Electrobun 1.18.1, Vercel AI SDK v5, GitHub Actions (`oven-sh/setup-bun`, `actions/upload-artifact@v5`, `gh` CLI).

**Spec:** `docs/superpowers/specs/2026-05-25-ci-release-pipeline-design.md`

---

## File structure

| File | Responsibility | Workstream |
|---|---|---|
| `package.json` (root) | add `version: "0.1.0"`; add `overrides` for `uuid`/`jsondiffpatch`; bump `happy-dom`/registrator/`turbo` | A, B |
| `apps/desktop/package.json` | version `0.1.0`; add `bin` + `compile` script | A, C |
| `apps/desktop/electrobun.config.ts` | `app.version` `0.1.0` | A |
| `packages/*/package.json`, `tooling/*/package.json` | version `0.1.0` | A |
| `packages/proxy/package.json` | bump `ai` → `^5` and all `@ai-sdk/*` to v5-compatible majors; swap ollama provider | B |
| `packages/proxy/src/providers/real-gateway.ts` | extract pure `mapFullStreamPart`; use v5 `streamText` options/shapes | B |
| `packages/proxy/src/providers/real-gateway.test.ts` (new) | unit-test `mapFullStreamPart` against v5 part shapes | B |
| `packages/proxy/src/providers/load-sdk.ts` | re-verify `create*` factories; swap ollama import | B |
| `apps/desktop/src/cli-deps.ts` (new) | export `cliDepsFrom(ctx)` (moved out of `main.ts`) | C |
| `apps/desktop/src/main.ts` | import `cliDepsFrom` from `./cli-deps` | C |
| `apps/desktop/src/cli.ts` (new) | standalone CLI binary entry (shebang; no Electrobun) | C |
| `apps/desktop/src/cli.test.ts` (new) | smoke test the CLI entry's exit/output behavior | C |
| `.github/workflows/ci.yml` | keep `bun audit` blocking (verify green) | C |
| `.github/workflows/canary.yml` (new) | gate → matrix build → `v0.1.0-canary.N` prerelease | C |
| `.github/workflows/release.yml` (new) | gate → matrix build → semver release on `v*` tag | C |

---

## Workstream A — Version sync to 0.1.0

### Task 1: Sync all workspace versions to 0.1.0

**Files:**
- Modify: `package.json` (root), `apps/desktop/package.json:5`, `apps/desktop/electrobun.config.ts`, every `packages/*/package.json:3`, every `tooling/*/package.json:3`

- [ ] **Step 1: Add `version` to root `package.json`**

Insert a `version` field right after `"name": "launchkit-monorepo",`:

```json
  "name": "launchkit-monorepo",
  "version": "0.1.0",
  "private": true,
```

- [ ] **Step 2: Set `0.1.0` everywhere else**

Run (updates the `"version": "0.0.x"` line in every workspace manifest):

```bash
cd /Users/fred/projects/personal/launchkit
for f in apps/desktop/package.json packages/*/package.json tooling/*/package.json; do
  perl -0pi -e 's/"version":\s*"0\.0\.\d+"/"version": "0.1.0"/' "$f"
done
perl -0pi -e 's/version:\s*"0\.0\.1"/version: "0.1.0"/' apps/desktop/electrobun.config.ts
```

- [ ] **Step 3: Verify every version is 0.1.0**

Run: `grep -rn '"version"' package.json apps/*/package.json packages/*/package.json tooling/*/package.json && grep -n 'version:' apps/desktop/electrobun.config.ts`
Expected: every line shows `0.1.0` (root + 1 app + 10 packages + 2 tooling + config).

- [ ] **Step 4: Verify gate still green**

Run: `bun run typecheck && bun run lint && bun test`
Expected: PASS (version strings are not runtime-coupled).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: sync all workspace versions to 0.1.0"
```

---

## Workstream B — Dependency remediation (must land before blocking-audit `ci.yml`)

### Task 2: Bump happy-dom to ^20

**Files:**
- Modify: `package.json` (root devDependencies)

- [ ] **Step 1: Observe the failing advisory (RED baseline)**

Run: `bun audit | grep -A2 happy-dom`
Expected: shows `happy-dom <20.0.0` critical + high advisories.

- [ ] **Step 2: Bump both happy-dom packages**

In root `package.json` devDependencies set:

```json
    "@happy-dom/global-registrator": "^20",
    "happy-dom": "^20",
```

- [ ] **Step 3: Install**

Run: `bun install`
Expected: lockfile updates; happy-dom resolves to 20.x.

- [ ] **Step 4: Run the full suite (DOM tests are the risk surface)**

Run: `bun test`
Expected: PASS. If any DOM/`@testing-library` test breaks on the happy-dom 20 API, fix it under TDD (update the test/setup to the new behavior) before continuing.

- [ ] **Step 5: Confirm the happy-dom advisories are gone**

Run: `bun audit | grep happy-dom || echo "happy-dom clean"`
Expected: `happy-dom clean`.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock && git commit -m "fix(deps): bump happy-dom to ^20 (resolves critical RCE advisory)"
```

### Task 3: Bump turbo + add uuid/jsondiffpatch overrides

**Files:**
- Modify: `package.json` (root devDependencies + new `overrides`)

- [ ] **Step 1: Bump turbo**

Run: `bun add -d turbo@latest` then confirm `package.json` shows turbo `>2.9.13`.

- [ ] **Step 2: Add `overrides` for the transitive advisories**

Add a top-level `overrides` block to root `package.json` (after `devDependencies`):

```json
  "overrides": {
    "uuid": "^11.1.1",
    "jsondiffpatch": "^0.7.2"
  }
```

- [ ] **Step 3: Install**

Run: `bun install`
Expected: `uuid` resolves ≥11.1.1 and `jsondiffpatch` ≥0.7.2 across the tree.

- [ ] **Step 4: Run the suite**

Run: `bun run typecheck && bun test`
Expected: PASS. (uuid 11 / jsondiffpatch 0.7.2 are consumed transitively by `ai`; fix any breakage under TDD.)

- [ ] **Step 5: Confirm these advisories are gone**

Run: `bun audit | grep -E 'turbo|uuid|jsondiffpatch' || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock && git commit -m "fix(deps): bump turbo + override uuid/jsondiffpatch (resolves transitive advisories)"
```

### Task 4: AI SDK v4 → v5 migration

**Files:**
- Modify: `packages/proxy/package.json` (deps)
- Modify: `packages/proxy/src/providers/real-gateway.ts`
- Create: `packages/proxy/src/providers/real-gateway.test.ts`
- Modify: `packages/proxy/src/providers/load-sdk.ts`

- [ ] **Step 1: Write the failing test for v5 stream-part mapping (RED)**

Create `packages/proxy/src/providers/real-gateway.test.ts`. This tests a pure helper we are about to extract; it encodes the **v5** part shapes (`text-delta` carries `.text`, not `.textDelta`):

```typescript
import { describe, expect, it } from "bun:test"
import { mapFullStreamPart } from "./real-gateway"

describe("mapFullStreamPart", () => {
  it("maps a v5 text-delta part to a text-delta event", () => {
    expect(mapFullStreamPart({ type: "text-delta", text: "hi" })).toEqual({
      type: "text-delta",
      text: "hi",
    })
  })

  it("maps a finish part to a finish event with stringified reason", () => {
    expect(mapFullStreamPart({ type: "finish", finishReason: "stop" })).toEqual(
      { type: "finish", finishReason: "stop" },
    )
  })

  it("maps an error part to an error event", () => {
    expect(
      mapFullStreamPart({ type: "error", error: new Error("boom") }),
    ).toEqual({ type: "error", detail: "Error: boom" })
  })

  it("returns undefined for unknown part types", () => {
    expect(mapFullStreamPart({ type: "text-start" })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test packages/proxy/src/providers/real-gateway.test.ts`
Expected: FAIL — `mapFullStreamPart` is not exported.

- [ ] **Step 3: Rewrite `real-gateway.ts` for v5 + extract the pure helper**

Replace the body of `packages/proxy/src/providers/real-gateway.ts` with:

```typescript
import { streamText } from "ai"
import type { LanguageModelGateway } from "../gateway"
import type { NormalizedRequest, StreamEvent } from "../types"
import type { ModelHandle } from "./factory"

/**
 * Pure mapping from an AI SDK v5 `fullStream` part to our internal `StreamEvent`.
 * v5 renamed the text-delta payload from `.textDelta` to `.text`; unknown part
 * types (e.g. `text-start`/`text-end`) map to `undefined` and are skipped.
 */
export const mapFullStreamPart = (
  part: { readonly type: string } & Record<string, unknown>,
): StreamEvent | undefined => {
  if (part.type === "text-delta")
    return { type: "text-delta", text: (part as { text: string }).text }
  if (part.type === "finish")
    return {
      type: "finish",
      finishReason: String((part as { finishReason: unknown }).finishReason),
    }
  if (part.type === "error")
    return { type: "error", detail: String((part as { error: unknown }).error) }
  return undefined
}

export const createRealGateway = (): LanguageModelGateway => ({
  async *stream(
    model: ModelHandle,
    req: NormalizedRequest,
  ): AsyncIterable<StreamEvent> {
    const result = streamText({
      model: model as Parameters<typeof streamText>[0]["model"],
      ...(req.system !== undefined ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.maxTokens !== undefined
        ? { maxOutputTokens: req.maxTokens }
        : {}),
      ...(req.temperature !== undefined
        ? { temperature: req.temperature }
        : {}),
    })
    try {
      for await (const part of result.fullStream) {
        const event = mapFullStreamPart(part as { type: string })
        if (event !== undefined) yield event
      }
    } catch (e) {
      yield {
        type: "error",
        detail: e instanceof Error ? e.message : "stream failed",
      }
    }
  },
})
```

Note the two v5 changes: `maxTokens` → `maxOutputTokens`, and `.textDelta` → `.text`.

- [ ] **Step 4: Run the new test to confirm it passes**

Run: `bun test packages/proxy/src/providers/real-gateway.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Bump `ai` and the provider packages to v5-compatible majors**

In `packages/proxy/package.json`, set `"ai": "^5"`. Then set each `@ai-sdk/*` to the major whose `ai` peer is `^5`. Confirm each precisely, e.g.:

```bash
for p in openai anthropic azure cerebras cohere fireworks google google-vertex groq mistral perplexity xai amazon-bedrock; do
  echo "@ai-sdk/$p -> $(npm view @ai-sdk/$p@latest version) (peer ai: $(npm view @ai-sdk/$p@latest peerDependencies.ai))"
done
```

Set each `@ai-sdk/*` dependency to `^<that-latest-major>` (only keep majors whose peer accepts `ai@5`).

- [ ] **Step 6: Swap the ollama provider to its v5-compatible package**

`ollama-ai-provider@1.x` targets `ai` v4. In `packages/proxy/package.json`, replace `"ollama-ai-provider"` with `"ollama-ai-provider-v2": "latest"` (verify with `npm view ollama-ai-provider-v2 peerDependencies.ai`). Then in `packages/proxy/src/providers/load-sdk.ts` update the `ollama` case import target:

```typescript
    case "ollama":
      return { create: (await import("ollama-ai-provider-v2")).createOllama }
```

(If `ollama-ai-provider-v2` is unavailable/incompatible at execution time, use the current maintained v5-compatible ollama provider package and adjust the import name to its exported factory.)

- [ ] **Step 7: Install and run the full gate**

Run: `bun install && bun run typecheck && bun run lint && bun test`
Expected: PASS. Fix any v5 type/signature breakage surfaced in `load-sdk.ts` or `factory.ts` under TDD (re-verify each `create*` export name against its new major).

- [ ] **Step 8: Commit**

```bash
git add packages/proxy/package.json packages/proxy/src/providers bun.lock
git commit -m "fix(proxy): migrate Vercel AI SDK v4 -> v5 (resolves ai upload advisory)"
```

### Task 5: Confirm `bun audit` is clean with no ignores

**Files:** none (verification gate)

- [ ] **Step 1: Run the audit**

Run: `bun audit`
Expected: `No vulnerabilities found` (exit 0). No `--ignore` used.

- [ ] **Step 2: Run the whole gate once more**

Run: `bun run typecheck && bun run lint && bun test && bun audit`
Expected: all green. This is the end state Workstream C's `ci.yml` depends on.

---

## Workstream C — CI/CD pipeline

### Task 6: Standalone CLI binary entry + smoke test

**Files:**
- Create: `apps/desktop/src/cli-deps.ts`
- Modify: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/cli.ts`
- Create: `apps/desktop/src/cli.test.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Extract `cliDepsFrom` into its own module**

Create `apps/desktop/src/cli-deps.ts` by moving the existing `cliDepsFrom` function out of `main.ts` (it stays byte-for-byte identical, just exported from here):

```typescript
import type { CliDeps, StartProxyDeps } from "@launchkit/cli"
import type { AppContext } from "./composition"

/** Assemble the CliDeps the CLI runner needs from a wired AppContext. */
export const cliDepsFrom = (ctx: AppContext): CliDeps => ({
  config: ctx.config,
  secrets: ctx.secrets,
  sessions: ctx.sessions,
  registry: ctx.registry,
  launch: ctx.launch,
  proxy: {
    isRunning: ctx.proxy.isRunning,
    start: (opts: StartProxyDeps) =>
      ctx.proxy.start({
        host: opts.host,
        port: opts.port,
        proxyKey: opts.proxyKey,
        config: opts.config,
      }),
  },
  genProxyKey: ctx.genProxyKey,
  out: {
    write: (line: string): void => {
      process.stdout.write(`${line}\n`)
    },
  },
})
```

- [ ] **Step 2: Update `main.ts` to import it**

In `apps/desktop/src/main.ts`, delete the local `cliDepsFrom` definition and add the import near the other imports:

```typescript
import { cliDepsFrom } from "./cli-deps"
```

- [ ] **Step 3: Verify the gate after the extraction**

Run: `bun run typecheck && bun test apps/desktop`
Expected: PASS (pure move; `main.ts` still references `cliDepsFrom`).

- [ ] **Step 4: Write the failing CLI smoke test (RED)**

Create `apps/desktop/src/cli.test.ts`. It exercises the pure `runCliMain` we are about to add, with a fake runner + captured exit/stderr so no real subsystems are constructed:

```typescript
import { describe, expect, it } from "bun:test"
import { ok, err } from "@launchkit/utils"
import { runCliMain } from "./cli"

describe("runCliMain", () => {
  it("exits 0 when the command succeeds", async () => {
    let code = -1
    await runCliMain(["bun", "cli", "list"], {
      run: async () => ok(undefined),
      exit: (c) => {
        code = c
      },
      errOut: () => {},
    })
    expect(code).toBe(0)
  })

  it("exits 1 and writes the error detail when the command fails", async () => {
    let code = -1
    let written = ""
    await runCliMain(["bun", "cli", "bogus"], {
      run: async () => err({ kind: "unknown-command", command: "bogus" }),
      exit: (c) => {
        code = c
      },
      errOut: (line) => {
        written = line
      },
    })
    expect(code).toBe(1)
    expect(written).toContain("bogus")
  })
})
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `bun test apps/desktop/src/cli.test.ts`
Expected: FAIL — `./cli` / `runCliMain` does not exist.

- [ ] **Step 6: Create `cli.ts` with the binary entry + testable core**

Create `apps/desktop/src/cli.ts`:

```typescript
#!/usr/bin/env bun
import { runCli } from "@launchkit/cli"
import type { CliError } from "@launchkit/cli"
import type { Result } from "@launchkit/utils"
import { cliDepsFrom } from "./cli-deps"
import { createAppContext } from "./composition"

/** Seams so the entry is unit-testable without real subsystems or a real process. */
export type CliMainDeps = {
  readonly run: (argv: readonly string[]) => Promise<Result<void, CliError>>
  readonly exit: (code: number) => void
  readonly errOut: (line: string) => void
}

/** Pure-ish core: run the CLI, map the Result to an exit code + stderr line. */
export const runCliMain = async (
  argv: readonly string[],
  deps: CliMainDeps,
): Promise<void> => {
  const result = await deps.run(argv)
  if (result.ok) {
    deps.exit(0)
    return
  }
  deps.errOut(`launchkit: ${JSON.stringify(result.error)}`)
  deps.exit(1)
}

// --- entry point: the single side effect -------------------------------------------
if (import.meta.main) {
  const ctx = createAppContext()
  await runCliMain(process.argv, {
    run: (argv) => runCli(cliDepsFrom(ctx))(argv),
    exit: (code) => process.exit(code),
    errOut: (line) => process.stderr.write(`${line}\n`),
  })
}
```

- [ ] **Step 7: Run the smoke test to confirm it passes**

Run: `bun test apps/desktop/src/cli.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Add the `bin` + `compile` script to `apps/desktop/package.json`**

Add a `bin` field and a `compile` script:

```json
  "bin": { "launchkit": "./src/cli.ts" },
  "scripts": {
    "build": "electrobun build",
    "compile": "bun build --compile --minify --outfile dist/launchkit-cli ./src/cli.ts",
    "typecheck": "tsc --noEmit -p tsconfig.typecheck.json",
    "test": "bun test"
  },
```

- [ ] **Step 9: Verify the compiled binary runs**

Run: `cd apps/desktop && bun run compile && ./dist/launchkit-cli list; echo "exit=$?"`
Expected: the `list` command runs (prints harnesses or an empty list) and exits 0; the binary is produced at `apps/desktop/dist/launchkit-cli`.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/cli-deps.ts apps/desktop/src/cli.ts apps/desktop/src/cli.test.ts apps/desktop/src/main.ts apps/desktop/package.json
git commit -m "feat(desktop): add standalone CLI binary entry + compile script"
```

### Task 7: Keep `bun audit` blocking in `ci.yml` (verify)

**Files:**
- Modify: `.github/workflows/ci.yml` (only if needed)

- [ ] **Step 1: Confirm the current gate already audits**

Read `.github/workflows/ci.yml`. It already runs `typecheck`, `lint`, `bun test`, `bun audit`. No change is needed beyond confirming `bun audit` has no `--ignore`/`--audit-level` flags (it must stay strict).

- [ ] **Step 2: Pin the bun version for reproducibility**

Update the setup step so CI matches the repo's `packageManager`:

```yaml
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml && git commit -m "ci: pin bun 1.3.14; keep bun audit blocking"
```

### Task 8: Canary workflow (push to main)

**Files:**
- Create: `.github/workflows/canary.yml`

- [ ] **Step 1: Create `.github/workflows/canary.yml`**

```yaml
name: Canary Release

on:
  push:
    branches: [main]

concurrency:
  group: canary-release
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  gate:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun test
      - run: bun audit

  build:
    name: Build (${{ matrix.name }})
    needs: gate
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: macOS arm64
            os: macos-latest
            asset: launchkit-darwin-arm64
            archive: tar.gz
            app: true
          - name: macOS x64
            os: macos-13
            asset: launchkit-darwin-x64
            archive: tar.gz
            app: true
          - name: Linux x64
            os: ubuntu-latest
            asset: launchkit-linux-x64
            archive: tar.gz
            app: true
          - name: Linux arm64
            os: ubuntu-24.04-arm
            asset: launchkit-linux-arm64
            archive: tar.gz
            app: true
          - name: Windows x64
            os: windows-latest
            asset: launchkit-windows-x64
            archive: zip
            app: false
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile

      - name: Compile CLI binary
        run: bun run --filter launchkit compile

      - name: Build desktop app (best-effort)
        id: app
        if: matrix.app
        continue-on-error: true
        run: bun run --filter launchkit build

      - name: Stage artifacts (unix)
        if: matrix.archive == 'tar.gz'
        shell: bash
        run: |
          mkdir -p stage
          cp apps/desktop/dist/launchkit-cli "stage/${{ matrix.asset }}-cli"
          if [ "${{ steps.app.outcome }}" = "success" ]; then
            tar czf "stage/${{ matrix.asset }}-app.tar.gz" -C apps/desktop/build .
          fi
          tar czf "stage/${{ matrix.asset }}-cli.tar.gz" -C stage "${{ matrix.asset }}-cli"
          rm -f "stage/${{ matrix.asset }}-cli"

      - name: Stage artifacts (windows)
        if: matrix.archive == 'zip'
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force -Path stage | Out-Null
          Copy-Item "apps/desktop/dist/launchkit-cli.exe" "stage/${{ matrix.asset }}-cli.exe" -ErrorAction SilentlyContinue
          if (-not (Test-Path "stage/${{ matrix.asset }}-cli.exe")) {
            Copy-Item "apps/desktop/dist/launchkit-cli" "stage/${{ matrix.asset }}-cli.exe"
          }
          Compress-Archive "stage/${{ matrix.asset }}-cli.exe" "stage/${{ matrix.asset }}-cli.zip"
          Remove-Item "stage/${{ matrix.asset }}-cli.exe"

      - uses: actions/upload-artifact@v5
        with:
          name: ${{ matrix.asset }}
          path: stage/*
          if-no-files-found: error

  release:
    name: Publish Canary Release
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v5
        with:
          path: artifacts
          merge-multiple: true
      - name: Determine canary version
        id: version
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION=$(jq -r .version package.json)
          LATEST=$(gh release list --json tagName --jq \
            "[.[] | select(.tagName | startswith(\"v${VERSION}-canary.\")) | .tagName | ltrimstr(\"v${VERSION}-canary.\") | tonumber] | max // 0")
          NEXT=$((LATEST + 1))
          echo "tag=v${VERSION}-canary.${NEXT}" >> "$GITHUB_OUTPUT"
      - name: Checksums
        run: cd artifacts && sha256sum * > checksums-sha256.txt
      - name: Create canary release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create ${{ steps.version.outputs.tag }} \
            --title "${{ steps.version.outputs.tag }}" \
            --notes "Automated canary build from \`main\` (${{ github.sha }}). Unstable pre-release." \
            --prerelease --target ${{ github.sha }} \
            artifacts/*
```

- [ ] **Step 2: Validate the YAML locally**

Run: `bunx --bun js-yaml .github/workflows/canary.yml > /dev/null && echo "valid yaml"`
Expected: `valid yaml`. (If `js-yaml` is unavailable, use `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/canary.yml'))"`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/canary.yml && git commit -m "ci: add canary release workflow (push to main)"
```

### Task 9: Release workflow (semver tag)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

Identical `gate` and `build` jobs to `canary.yml` (copy them verbatim), but the trigger and `release` job differ:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  # gate: <copy the `gate` job from canary.yml verbatim>
  # build: <copy the `build` job from canary.yml verbatim>

  release:
    name: Publish Release
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v5
        with:
          path: artifacts
          merge-multiple: true
      - name: Checksums
        run: cd artifacts && sha256sum * > checksums-sha256.txt
      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create ${{ github.ref_name }} \
            --title "${{ github.ref_name }}" \
            --notes "LaunchKit ${{ github.ref_name }} (${{ github.sha }})." \
            --target ${{ github.sha }} \
            artifacts/*
```

When copying `gate` and `build`, paste the full job bodies from `canary.yml` (the engineer may read this task out of order — open `canary.yml` and copy the two jobs exactly, unchanged).

- [ ] **Step 2: Validate the YAML**

Run: `bunx --bun js-yaml .github/workflows/release.yml > /dev/null && echo "valid yaml"`
Expected: `valid yaml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml && git commit -m "ci: add semver release workflow (v* tags)"
```

- [ ] **Step 4: Update PROGRESS.md**

Append a short note under a new "CI/CD" section recording: audit green (no ignores), AI SDK on v5, versions at 0.1.0, canary on main + release on `v*` tags, with this plan's path. Commit:

```bash
git add build-plan/PROGRESS.md && git commit -m "docs(progress): record CI fix + canary/release pipeline"
```

---

## Self-review

- **Spec coverage:** Issue 1 (CI red) → Tasks 2–5 + 7. Issue 2 (build canary on main + release on tag) → Tasks 6, 8, 9. Issue 3 (root version) → Task 1. AI SDK migration → Task 4. CLI binary gap → Task 6. All spec sections map to a task.
- **Placeholder scan:** Step 5/6 of Task 4 use exact `npm view` commands to resolve the precise provider majors at execution time (a verification step, not a placeholder — the AI SDK provider majors must be confirmed live). Workflow YAML is complete and copy-paste ready. Task 9 instructs copying the `gate`/`build` jobs verbatim from `canary.yml` rather than restating them (they are long and must stay byte-identical).
- **Type consistency:** `cliDepsFrom`, `runCliMain`, `CliMainDeps`, `mapFullStreamPart` names are consistent across tasks. `StreamEvent`/`NormalizedRequest` reused from `../types`. `Result`/`ok`/`err` from `@launchkit/utils` match the codebase.
- **Risk gating:** non-mac Electrobun app build is `continue-on-error` + `if: matrix.app`, so a failed app build yields CLI-only artifacts for that platform without failing the release (matches the spec's fallback).
