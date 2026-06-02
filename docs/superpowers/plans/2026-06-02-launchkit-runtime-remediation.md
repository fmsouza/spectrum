# LaunchKit Runtime Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow `build-plan/01-conventions/*` (TypeScript strict, functional style, `Result<T,E>`, effects behind injected adapters) and the per-task gate `bun run typecheck && bun run lint && bun test`.

**Goal:** Make the LaunchKit GUI app actually run when launched (it currently never executes its own code), close the remaining functional gaps surfaced by the review, and give the user a documented way to build, install, and test the dev `.app` + CLI on their machine.

**Architecture:** Five phases. **Phase A** fixes the P0 blocker — the Electrobun launcher loads `bun/index.js` in a `Worker`, but the build emits `bun/main.js` and the startup is gated behind `if (import.meta.main)` (always false in a Worker), so nothing initializes. **Phase B** makes GUI custom-harness CRUD persist. **Phase C** hardens dependencies, fixes the CLI proxy-key reuse bug, and writes install docs. **Phase D** runs the never-executed manual-verification checklist and a repeatable runtime smoke test. Each task is TDD where it touches logic; the runtime/entry wiring is verified by a build-and-run smoke test because that exact class of bug (build passes, app never runs) is what the review caught.

**Tech Stack:** Bun, Electrobun v1.18.x, TypeScript (strict), Vercel AI SDK v6, `bun test` (Jest API), Biome.

---

## Background: what the review found (read before starting)

Verified state at planning time (2026-06-02): the full gate is green (`typecheck` + `lint` + **444 tests pass**), the CLI binary compiles and works, and `bunx electrobun build` produces a complete `.app` bundle. But:

1. **P0 — the GUI app never executes its own code.** The bundled launcher (`Contents/Resources/main.js`) does, at line ~156/160: `appEntrypointPath = join(appFolderPath, "bun", "index.js")` then `new Worker(appEntrypointPath, {})`. Two defects combine:
   - The build emits `bun/main.js` (entrypoint basename is `main.ts`), but the launcher loads `bun/index.js` — **the file does not exist**, so the Worker loads nothing.
   - Our entry runs via `if (import.meta.main) { await main(...) }` in `apps/desktop/src/main.ts:72`. `import.meta.main` is **false inside a Worker**, so even with the right filename the entry would not fire.
   - Evidence: launching the built `.app` never binds `127.0.0.1:4000`; `curl /health` refuses connection. Running the bundle *as a real entrypoint* (`bun .../app/bun/main.js`) DOES bind the proxy and returns `{"ok":true}` — proving the proxy/window/tray code is correct and the only fault is the entry never running under the launcher.
2. **P1 — GUI custom-harness CRUD silently loses data.** `apps/desktop/src/gui/ipc/handlers.ts:171-180` (`addHarness`/`updateHarness`/`deleteHarness`) echo input but never write to disk; `HarnessFileSource` (`packages/harnesses/src/file-source.ts`) is read-only (`listDefinitions` only).
3. **P2 — install ergonomics.** No root `README.md`. `@ai-sdk/*` + `ai` are `optionalDependencies` in `packages/proxy/package.json`, so a degraded install silently yields runtime `unsupported-provider` instead of failing at install.
4. **P3 — CLI `launch` proxy-key mismatch.** `packages/cli/src/launch-command.ts:61-72` mints a fresh `genProxyKey()` even when reusing an already-running proxy, so a harness launched from the CLI while the GUI proxy is up gets a key the running proxy will reject.
5. **The manual-verification checklist was never run.** `apps/desktop/MANUAL-VERIFICATION.md` is 100% unchecked — the GUI/tray/end-to-end runtime was never confirmed. This is the process gap that let P0 ship as "done".

**Decisions locked with the user (2026-06-02):** distribution target = **local dev `.app` + CLI binary** (no DMG/codesign); scope = **all findings**.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/desktop/src/index.ts` | The Electrobun bun-process entrypoint. Thin: unconditionally runs `main(process.argv, buildRealDeps(createAppContext))`. Bundles to `bun/index.js` and runs in a Worker (no `import.meta.main` guard). | **Create** |
| `apps/desktop/src/main.ts` | Pure, testable entry wiring (`main`, `buildRealDeps`). No self-executing side effect. | Modify (remove `import.meta.main` block) |
| `apps/desktop/electrobun.config.ts` | `build.bun.entrypoint` → `src/index.ts` so the bundle emits `bun/index.js`. | Modify |
| `apps/desktop/scripts/smoke.sh` | Repeatable runtime smoke test: build → launch → probe `/health` → assert loopback → kill. | **Create** |
| `apps/desktop/MANUAL-VERIFICATION.md` | Checklist actually executed and checked off with evidence. | Modify |
| `packages/harnesses/src/file-source.ts` | Add `writeDefinition` / `deleteDefinition` to `HarnessFileSource` + recording fake. | Modify |
| `packages/harnesses/src/adapters.ts` | Implement write/delete in `createDirHarnessFileSource` (atomic 0600 write, 0700 dir, ENOENT-safe delete). | Modify |
| `packages/harnesses/src/registry.ts` | Add `add(def)` / `remove(id)` to `HarnessRegistry` (validate, force `builtIn:false`, reject built-in/dup ids). | Modify |
| `apps/desktop/src/gui/ipc/handlers.ts` | Wire `addHarness`/`updateHarness`/`deleteHarness` to the registry. | Modify |
| `packages/proxy/package.json` | Move `ai` + `@ai-sdk/*` + `ollama-ai-provider-v2` from `optionalDependencies` → `dependencies`. | Modify |
| `packages/proxy/src/runtime-state.ts` | `RuntimeState` interface (`readProxyKey`/`writeProxyKey`/`clear`) + in-memory fake + real fs adapter. | **Create** |
| `packages/cli/src/launch-command.ts` | On proxy reuse, read the shared key via injected `RuntimeState`; on fresh start, write it. | Modify |
| `packages/cli/src/run.ts` / `deps` | Thread `RuntimeState` through `CliDeps`. | Modify |
| `apps/desktop/src/composition.ts` | Construct the real `RuntimeState` adapter; write the key when the GUI proxy starts; thread into CLI deps. | Modify |
| `apps/desktop/src/main.ts` (`startProxy`) | Write the runtime key on GUI proxy start; clear on stop. | Modify |
| `README.md` | Root build/install/run instructions for the dev `.app` + CLI. | **Create** |

---

## Phase A — P0: make the GUI app actually run

### Task A1: Move startup to an unconditional Electrobun entrypoint

**Files:**
- Create: `apps/desktop/src/index.ts`
- Modify: `apps/desktop/src/main.ts:68-74` (remove the `import.meta.main` self-run)
- Modify: `apps/desktop/electrobun.config.ts:21`
- Test: `apps/desktop/src/main.test.ts` (existing — confirm it still imports `{ main, buildRealDeps }` and passes with no self-execution)

- [ ] **Step 1: Write the failing test** — assert importing `main.ts` has no startup side effect (proves the entry no longer self-runs), and that `main` still slices argv. Add to `apps/desktop/src/main.test.ts`:

```ts
it("does not start the proxy or open a window merely by importing main.ts", async () => {
  // Importing the module must be side-effect free now that the entrypoint lives in index.ts.
  const mod = await import("./main")
  expect(typeof mod.main).toBe("function")
  expect(typeof mod.buildRealDeps).toBe("function")
  // No exported `import.meta.main` self-run remains: a spy entry is never invoked on import.
})

it("slices the [runtime, script] prefix before passing argv to runApp", async () => {
  const calls: string[][] = []
  const deps = {
    runCli: async (argv: readonly string[]) => { calls.push([...argv]) },
    startProxy: () => ({ stop: () => {} }),
    openWindow: () => {},
  }
  await mainModule.main(["bun", "/path/main.js", "list", "harnesses"], deps)
  expect(calls[0]).toEqual(["list", "harnesses"])
})
```

(Use the existing import style in `main.test.ts`; if it imports `* as mainModule`, keep that. If the second test already exists, keep only the first.)

- [ ] **Step 2: Run test to verify it fails** — Run: `bun test apps/desktop/src/main.test.ts`. Expected: the first test fails to compile/import only if `main.ts` still self-runs in a way that breaks; otherwise it passes trivially. The real RED is the next step (the build/run smoke). Record the result.

- [ ] **Step 3: Remove the self-run from `main.ts`.** Delete lines 68-74 (the `// --- entry point ---` comment block and the `if (import.meta.main) { await main(...) }`). Keep all exports (`buildRealDeps`, `main`) and their imports. The file becomes side-effect-free.

- [ ] **Step 4: Create `apps/desktop/src/index.ts`** — the unconditional entrypoint:

```ts
import { createAppContext } from "./composition"
import { buildRealDeps, main } from "./main"

/**
 * Electrobun bun-process entrypoint. Bundled to `bun/index.js`, which the Electrobun launcher
 * loads via `new Worker(...)`. Inside a Worker `import.meta.main` is `false`, so startup must NOT
 * be gated on it — this file runs `main` unconditionally. All decision logic stays in the pure,
 * tested `main` / `buildRealDeps` (see main.ts); this is a thin, build-verified shell.
 */
await main(process.argv, buildRealDeps(createAppContext))
```

- [ ] **Step 5: Point the bundle at the new entry.** In `apps/desktop/electrobun.config.ts:21` change `bun: { entrypoint: "src/main.ts" }` → `bun: { entrypoint: "src/index.ts" }`. Update the surrounding comment to note the launcher loads `bun/index.js` in a Worker.

- [ ] **Step 6: Run the gate** — Run: `bun run typecheck && bun run lint && bun test`. Expected: all green (the 444 existing tests + the new one).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/index.ts apps/desktop/src/main.ts apps/desktop/electrobun.config.ts apps/desktop/src/main.test.ts
git commit -m "fix(desktop): run startup from bun/index.js entry (Worker has no import.meta.main) [remediation-A1]"
```

### Task A2: Rebuild and prove the app runs end-to-end (smoke script)

**Files:**
- Create: `apps/desktop/scripts/smoke.sh`

- [ ] **Step 1: Write the smoke script** `apps/desktop/scripts/smoke.sh` (chmod +x). It is the regression guard for "build passes but app never runs":

```bash
#!/usr/bin/env bash
# Build the dev .app, launch it, prove the proxy binds on loopback, then clean up.
# Exits non-zero on any failure. macOS only.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${LK_PORT:-4000}"
APP="build/dev-macos-arm64/LaunchKit-dev.app"

echo "==> building"
bunx electrobun build

echo "==> verifying launcher entrypoint exists (bun/index.js)"
test -f "$APP/Contents/Resources/app/bun/index.js" \
  || { echo "FAIL: bundle is missing bun/index.js — launcher will load nothing"; exit 1; }

echo "==> launching app"
open "$APP"
trap 'pkill -f "LaunchKit-dev" 2>/dev/null || true' EXIT

echo "==> waiting for proxy /health on 127.0.0.1:$PORT"
ok=""
for _ in $(seq 1 20); do
  if curl -fsS -m 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
test -n "$ok" || { echo "FAIL: proxy never bound on 127.0.0.1:$PORT after launch"; exit 1; }

echo "==> asserting loopback-only binding (never 0.0.0.0/*)"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -q "127.0.0.1:$PORT" \
  || { echo "FAIL: proxy not bound to loopback"; exit 1; }
! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -qE "\*:$PORT|0\.0\.0\.0:$PORT" \
  || { echo "FAIL: proxy bound to a public interface"; exit 1; }

echo "PASS: app launches, proxy bound to loopback, /health ok"
```

- [ ] **Step 2: Run it to confirm RED→GREEN.** Run: `bash apps/desktop/scripts/smoke.sh`. Before Task A1 this fails at the `bun/index.js` / `/health` checks; after A1 it must print `PASS`. If it still fails, STOP and use `superpowers:systematic-debugging` — capture the child process output (the app's stdout/stderr) before proposing any fix; do not mark this task done on an unverified claim.

- [ ] **Step 3: Confirm the window and tray appear (eyes-on).** With the app launched by the script (or `open "$APP"`), confirm a window titled "LaunchKit" opens and a tray icon appears in the menu bar. (These need a real GUI; the script cannot assert them.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/scripts/smoke.sh
git commit -m "test(desktop): add runtime smoke script proving the launched app binds the proxy [remediation-A2]"
```

### Task A3: Execute the manual-verification checklist

**Files:**
- Modify: `apps/desktop/MANUAL-VERIFICATION.md`

- [ ] **Step 1:** On a real macOS run of the built app, work through every box in `apps/desktop/MANUAL-VERIFICATION.md`: window opens, tray + status row, Launch submenu lists the 4 built-ins, clicking Launch spawns a harness + adds a Sessions row, Open/Quit, CLI list commands, CLI `launch` reuses the running proxy (verified properly after Task C2), provider Test ok/not-ok, config export/import, and the loopback/no-secret security spot-checks.
- [ ] **Step 2:** Check each `[ ]` → `[x]` only for items you actually observed. For any that fail, file the failure as a new finding and use `superpowers:systematic-debugging`; do not check the box.
- [ ] **Step 3: Commit**

```bash
git add apps/desktop/MANUAL-VERIFICATION.md
git commit -m "docs(desktop): record executed manual-verification results [remediation-A3]"
```

---

## Phase B — P1: persist GUI custom-harness CRUD

### Task B1: Add write/delete to `HarnessFileSource`

**Files:**
- Modify: `packages/harnesses/src/file-source.ts`
- Modify: `packages/harnesses/src/adapters.ts`
- Test: `packages/harnesses/src/file-source.test.ts`, `packages/harnesses/src/adapters.integration.test.ts`

- [ ] **Step 1: Write failing tests for the fake** (`file-source.test.ts`):

```ts
it("records a written definition so a subsequent list returns it", async () => {
  const src = createInMemoryHarnessFileSource([])
  const def = { id: "mine", name: "Mine", builtIn: false /* ...other required fields */ }
  expect((await src.writeDefinition(def)).ok).toBe(true)
  const listed = await src.listDefinitions()
  expect(listed.ok && listed.value).toContainEqual(def)
})

it("removes a definition by id when deleteDefinition is called", async () => {
  const def = { id: "mine", name: "Mine", builtIn: false /* ... */ }
  const src = createInMemoryHarnessFileSource([def])
  expect((await src.deleteDefinition("mine")).ok).toBe(true)
  const listed = await src.listDefinitions()
  expect(listed.ok && listed.value).toEqual([])
})
```

- [ ] **Step 2: Run** `bun test packages/harnesses/src/file-source.test.ts` — Expected: FAIL (`writeDefinition`/`deleteDefinition` not on the interface).

- [ ] **Step 3: Extend the interface + fake** in `file-source.ts`:

```ts
export interface HarnessFileSource {
  listDefinitions(): Promise<Result<readonly unknown[], HarnessError>>
  writeDefinition(definition: unknown): Promise<Result<void, HarnessError>>
  deleteDefinition(id: string): Promise<Result<void, HarnessError>>
}
```

Update `createInMemoryHarnessFileSource` to hold a mutable array and implement the two methods (push/replace by `id`, filter on delete), still honoring the preset `failure`.

- [ ] **Step 4: Run** the fake tests — Expected: PASS.

- [ ] **Step 5: Write a failing dir-adapter integration test** (`adapters.integration.test.ts`) using a real temp dir:

```ts
it("writes a harness JSON file and reads it back, then deletes it", async () => {
  const dir = `${tmpdir()}/lk-harness-${crypto.randomUUID()}`
  const src = createDirHarnessFileSource(dir)
  const def = { id: "mine", name: "Mine", builtIn: false /* ...required fields */ }
  expect((await src.writeDefinition(def)).ok).toBe(true)
  const listed = await src.listDefinitions()
  expect(listed.ok && listed.value).toContainEqual(def)
  expect((await src.deleteDefinition("mine")).ok).toBe(true)
  const after = await src.listDefinitions()
  expect(after.ok && after.value).toEqual([])
})
```

- [ ] **Step 6: Run** it — Expected: FAIL (methods unimplemented in `createDirHarnessFileSource`).

- [ ] **Step 7: Implement in `adapters.ts`.** Add `writeDefinition` (ensure dir `mkdir(dir,{recursive,mode:0o700})`, write `join(dir, "<id>.json")` with `mode:0o600` via the same atomic tmp→rename pattern used in `packages/config/src/fs-config-file.ts`) and `deleteDefinition` (`unlink`, treat ENOENT as success). Sanitize `id` (reject `/`, `..`, empty) → `err({ kind: ... })`. Return `ok(undefined)` on success.

- [ ] **Step 8: Run** the gate `bun run typecheck && bun run lint && bun test` — Expected: green.

- [ ] **Step 9: Commit**

```bash
git add packages/harnesses/src/file-source.ts packages/harnesses/src/adapters.ts packages/harnesses/src/file-source.test.ts packages/harnesses/src/adapters.integration.test.ts
git commit -m "feat(harnesses): add write/delete to HarnessFileSource + dir adapter [remediation-B1]"
```

### Task B2: Registry add/remove + wire IPC handlers

**Files:**
- Modify: `packages/harnesses/src/registry.ts`
- Modify: `apps/desktop/src/gui/ipc/handlers.ts:171-180`
- Test: `packages/harnesses/src/registry.test.ts`, `apps/desktop/src/gui/ipc/handlers.test.ts`

- [ ] **Step 1: Write failing registry tests** (`registry.test.ts`):

```ts
it("adds a custom harness, forcing builtIn to false", async () => {
  const fs = createInMemoryHarnessFileSource([])
  const reg = createRegistry({ fileSource: fs })
  const res = await reg.add({ id: "mine", name: "Mine", builtIn: true /* ... */ })
  expect(res.ok).toBe(true)
  const listed = await reg.list()
  expect(listed.ok && listed.value.find((h) => h.id === "mine")?.builtIn).toBe(false)
})

it("rejects adding a harness whose id collides with a built-in", async () => {
  const reg = createRegistry({ fileSource: createInMemoryHarnessFileSource([]) })
  const res = await reg.add({ id: "claude", name: "x", builtIn: false /* ... */ })
  expect(res.ok).toBe(false)
})

it("removes a custom harness by id", async () => {
  const fs = createInMemoryHarnessFileSource([{ id: "mine", name: "Mine", builtIn: false /* ... */ }])
  const reg = createRegistry({ fileSource: fs })
  expect((await reg.remove("mine")).ok).toBe(true)
})
```

- [ ] **Step 2: Run** `bun test packages/harnesses/src/registry.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `add`/`remove` on `HarnessRegistry` in `registry.ts`: validate `definition` with `HarnessDefinitionSchema`, override `builtIn: false`, reject ids present in `builtinHarnesses`, delegate to `fileSource.writeDefinition` / `deleteDefinition`. Return `Result<void, HarnessError>`.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write failing handler tests** (`handlers.test.ts`) with a fake registry, asserting `addHarness`/`deleteHarness` call through (not echo) and surface failures as the IPC error shape.

- [ ] **Step 6: Run** — Expected: FAIL (handlers still echo).

- [ ] **Step 7: Wire handlers** in `apps/desktop/src/gui/ipc/handlers.ts:171-180`:

```ts
addHarness: async (definition) => {
  const res = await ctx.registry.add(definition)
  if (!isOk(res)) return fail("could not add harness")
  return definition
},
updateHarness: async ({ id, input }) => {
  const res = await ctx.registry.add({ ...input, id })
  if (!isOk(res)) return fail("could not update harness")
  return { ...input, id }
},
deleteHarness: async ({ id }) => {
  const res = await ctx.registry.remove(id)
  if (!isOk(res)) return fail("could not delete harness")
  return null
},
```

(Match the real handler param shapes; `updateHarness` upserts via `add`, which overwrites the same `<id>.json`.) Ensure `AppContext.registry` type includes `add`/`remove` (it points at `HarnessRegistry`, so it updates automatically).

- [ ] **Step 8: Run** the gate — Expected: green.

- [ ] **Step 9: Commit**

```bash
git add packages/harnesses/src/registry.ts packages/harnesses/src/registry.test.ts apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/ipc/handlers.test.ts
git commit -m "feat(harnesses): persist GUI custom-harness add/update/delete via registry [remediation-B2]"
```

---

## Phase C — P2/P3: hardening + docs

### Task C1: AI SDK providers are real dependencies (fail-loud install)

**Files:**
- Modify: `packages/proxy/package.json`

- [ ] **Step 1:** Move every `ai`, `@ai-sdk/*`, and `ollama-ai-provider-v2` entry from `optionalDependencies` to `dependencies` (keep exact version ranges). Remove the now-empty `optionalDependencies` block.
- [ ] **Step 2:** Run `bun install` then `bun audit` — Expected: lockfile updates cleanly; `bun audit` still exits 0 with no `--ignore` flags (the v6 migration already cleared advisories).
- [ ] **Step 3:** Run the gate `bun run typecheck && bun run lint && bun test` — Expected: green (lazy `import()` of providers is unchanged; this only changes install guarantees).
- [ ] **Step 4: Commit**

```bash
git add packages/proxy/package.json bun.lock
git commit -m "fix(proxy): make AI SDK providers regular deps so a degraded install fails loudly [remediation-C1]"
```

### Task C2: CLI `launch` shares the running proxy's key

**Files:**
- Create: `packages/proxy/src/runtime-state.ts`
- Modify: `packages/proxy/src/index.ts` (export it)
- Modify: `packages/cli/src/launch-command.ts:60-74`, plus `CliDeps`/`StartProxyDeps` wiring in `packages/cli/src/run.ts` (or wherever `CliDeps` is defined)
- Modify: `apps/desktop/src/composition.ts` + `apps/desktop/src/main.ts` (`startProxy`) + `apps/desktop/src/cli-deps.ts`
- Test: `packages/proxy/src/runtime-state.test.ts`, `packages/cli/src/launch-command.test.ts`

- [ ] **Step 1: Write failing tests for `RuntimeState`** (`runtime-state.test.ts`) covering the in-memory fake: `writeProxyKey` then `readProxyKey` returns the key; `clear` makes `readProxyKey` return `null`; `readProxyKey` returns `null` when nothing was written.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Create `runtime-state.ts`:**

```ts
import { type Result, err, ok } from "@launchkit/utils"

/** Tracks the live proxy's per-run key so a second process (CLI) can reuse the running proxy. */
export interface RuntimeState {
  readProxyKey(): Promise<string | null>
  writeProxyKey(key: string): Promise<Result<void, { kind: "io-failed"; detail: string }>>
  clear(): Promise<void>
}

export const createInMemoryRuntimeState = (): RuntimeState => {
  let key: string | null = null
  return {
    readProxyKey: async () => key,
    writeProxyKey: async (k) => { key = k; return ok(undefined) },
    clear: async () => { key = null },
  }
}

/** Real adapter: a 0600 JSON file (e.g. ~/.config/launchkit/runtime.json) holding only { proxyKey }. */
export const createFileRuntimeState = (path: string): RuntimeState => ({
  readProxyKey: async () => {
    try {
      const raw = await Bun.file(path).json()
      return typeof raw?.proxyKey === "string" ? raw.proxyKey : null
    } catch {
      return null
    }
  },
  writeProxyKey: async (key) => {
    try {
      await Bun.write(path, JSON.stringify({ proxyKey: key }))
      await Bun.spawn(["chmod", "600", path]).exited
      return ok(undefined)
    } catch (cause) {
      return err({ kind: "io-failed", detail: cause instanceof Error ? cause.message : String(cause) })
    }
  },
  clear: async () => {
    try { await Bun.file(path).unlink() } catch { /* ENOENT ok */ }
  },
})
```

(Prefer the existing atomic-write helper if the proxy package already has one; otherwise this is acceptable for a non-secret runtime file. The key is also stored in the keychain-free config domain — it is a per-run token, not a long-lived secret.)

- [ ] **Step 4: Run** — Expected: PASS. Export both from `packages/proxy/src/index.ts`.

- [ ] **Step 5: Write a failing `launch-command` test** asserting reuse semantics:

```ts
it("reuses the running proxy's key instead of minting a new one when the proxy is already up", async () => {
  const runtime = createInMemoryRuntimeState()
  await runtime.writeProxyKey("KEY-FROM-RUNNING-PROXY")
  const handed: string[] = []
  const deps = makeLaunchDeps({
    proxy: { isRunning: async () => true, start: () => { throw new Error("must not start") } },
    runtime,
    genProxyKey: () => "FRESH-SHOULD-NOT-BE-USED",
    launch: (opts) => { handed.push(opts.proxyKey); return ok({ pid: 1 }) },
  })
  await launchCommand(deps)("claude", {})
  expect(handed[0]).toBe("KEY-FROM-RUNNING-PROXY")
})

it("mints and persists a key when starting a fresh proxy", async () => {
  const runtime = createInMemoryRuntimeState()
  const deps = makeLaunchDeps({
    proxy: { isRunning: async () => false, start: () => {} },
    runtime,
    genProxyKey: () => "FRESH",
    launch: (opts) => ok({ pid: 1 }),
  })
  await launchCommand(deps)("claude", {})
  expect(await runtime.readProxyKey()).toBe("FRESH")
})
```

- [ ] **Step 6: Run** — Expected: FAIL (`runtime` not on deps; current code always uses `genProxyKey()`).

- [ ] **Step 7: Implement** in `launch-command.ts`. Replace lines 60-72:

```ts
const alreadyRunning = await deps.proxy.isRunning(proxyUrl)
let proxyKey: string
if (alreadyRunning) {
  // Reuse the live proxy's key so the harness authenticates against it.
  proxyKey = (await deps.runtime.readProxyKey()) ?? deps.genProxyKey()
} else {
  proxyKey = deps.genProxyKey()
  deps.proxy.start({ host: settings.proxyHost, port: settings.proxyPort, proxyKey, config: loaded.value })
  await deps.runtime.writeProxyKey(proxyKey)
}
```

Add `readonly runtime: RuntimeState` to `CliDeps` (and a fake in test helpers).

- [ ] **Step 8: Wire the real adapter.** In `apps/desktop/src/composition.ts`, build `createFileRuntimeState(join(configDir, "runtime.json"))`, expose it on `AppContext`, include it in `cli-deps.ts`'s `cliDepsFrom`, and in `apps/desktop/src/main.ts`'s `startProxy` write the key after `ctx.proxy.start(...)` and `void ctx.runtime.clear()` in the returned `stop()`.

- [ ] **Step 9: Run** the gate — Expected: green.

- [ ] **Step 10: Commit**

```bash
git add packages/proxy/src/runtime-state.ts packages/proxy/src/runtime-state.test.ts packages/proxy/src/index.ts packages/cli/src/launch-command.ts packages/cli/src/launch-command.test.ts packages/cli/src/run.ts apps/desktop/src/composition.ts apps/desktop/src/main.ts apps/desktop/src/cli-deps.ts
git commit -m "fix(cli): reuse the running proxy's key on launch instead of minting a mismatched one [remediation-C2]"
```

### Task C3: Root README (build / install / run)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: one-paragraph what-it-is (link `build-plan/00-overview.md`); **Prerequisites** (macOS, Bun ≥ 1.3.14, `bun install`); **Build & run the GUI** (`cd apps/desktop && bunx electrobun build` → `build/dev-macos-arm64/LaunchKit-dev.app`; install by dragging to `/Applications` or `open` it in place; note it is an unsigned dev build — first launch may need right-click → Open to bypass Gatekeeper); **Build & use the CLI** (`bun run --filter @launchkit/desktop compile` → `apps/desktop/dist/launchkit-cli`; example `./launchkit-cli list harnesses`, `./launchkit-cli launch claude --model fast`); **Configure providers** (via the GUI Providers page; keys go to the macOS Keychain); **Develop** (the gate `bun run typecheck && bun run lint && bun test`, and `bash apps/desktop/scripts/smoke.sh`); link `build-plan/README.md`.
- [ ] **Step 2: Verify the commands** in the README actually work by running them once (build, compile, smoke). Fix any drift.
- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add root README with build/install/run instructions [remediation-C3]"
```

### Task C4: Tidy stale comments (cosmetic)

**Files:**
- Modify: `packages/cli/src/run.ts:42`, `apps/desktop/src/gui/ipc/handlers.ts` (the obsolete "gui-pages replaces with a file write" note now that B2 wired it)

- [ ] **Step 1:** Remove the misleading `// --- command stubs (replaced in cli-03/04/05)` comment in `run.ts:42` and the obsolete no-op-persistence comment in `handlers.ts`. No behavior change.
- [ ] **Step 2:** Run `bun run lint && bun test` — Expected: green.
- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/run.ts apps/desktop/src/gui/ipc/handlers.ts
git commit -m "chore: remove stale stub comments [remediation-C4]"
```

---

## Phase D — final verification + ledger

### Task D1: Full gate, smoke re-run, ledger update

**Files:**
- Modify: `build-plan/PROGRESS.md`

- [ ] **Step 1:** Run the full gate from repo root: `bun run typecheck && bun run lint && bun test`. Expected: all green; test count ≥ 444 + the new tests.
- [ ] **Step 2:** Re-run `bash apps/desktop/scripts/smoke.sh`. Expected: `PASS`.
- [ ] **Step 3:** Re-run the relevant `MANUAL-VERIFICATION.md` items affected by B2 (custom harness add/delete now persists across a relaunch) and C2 (CLI launch reuses the GUI proxy). Check the boxes.
- [ ] **Step 4:** Add a dated remediation section to `build-plan/PROGRESS.md` documenting: the P0 entry-guard/`index.js` fix, custom-harness persistence, deps hardening, proxy-key reuse, README + smoke script, and the executed manual checklist — each with its commit SHA. Add a one-line memory pointer if appropriate (a `feedback` memory: "build-passing ≠ app-runs; require the smoke script + executed manual checklist before marking GUI tasks done").
- [ ] **Step 5: Commit**

```bash
git add build-plan/PROGRESS.md apps/desktop/MANUAL-VERIFICATION.md
git commit -m "docs(progress): record runtime remediation + executed verification [remediation-D1]"
```

---

## Self-review notes

- **Spec coverage:** P0 (A1–A3), P1 (B1–B2), P2 install docs (C3) + deps (C1), P3 proxy key (C2), process gap = unchecked checklist (A3, D1). All five review findings have tasks.
- **Type consistency:** `HarnessFileSource` gains `writeDefinition`/`deleteDefinition` (B1) used by `HarnessRegistry.add`/`remove` (B2) called by the IPC handlers (B2). `RuntimeState` (`readProxyKey`/`writeProxyKey`/`clear`) is defined in C2 and used consistently in `launch-command.ts`, `composition.ts`, and `main.ts`. Entry: `main.ts` exports `main`/`buildRealDeps`; `index.ts` consumes them — names match.
- **Deferred (explicitly out of scope, low value):** the inbound-parser `temperature` not re-validating through `NormalizedRequestSchema` is cosmetic (providers reject invalid values); note it in PROGRESS.md as a known minor gap rather than a task.
- **Ordering:** A1 must precede A2 (smoke needs the fix). A2/A3 can inform C2's manual check. B1 precedes B2. C2 precedes the D1 CLI-reuse manual check.
