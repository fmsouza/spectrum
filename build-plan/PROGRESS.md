# PROGRESS — LaunchKit build ledger

**This file is the single source of truth for build state.** See `EXECUTION.md` for the protocol. Update it in the same commit as the work it tracks.

## Status: Phase 3 complete (+ build & runtime remediation)

All build-plan tasks are `done`. The LaunchKit binary builds (`bunx electrobun build` →
`apps/desktop/build/<target>/LaunchKit-dev.app`), the full gate
(`bun run typecheck && bun run lint && bun test`) is green, and the manual-verification checklist
(`apps/desktop/MANUAL-VERIFICATION.md`) covers the native window/tray paths that automated tests cannot.

### Post-completion remediation (2026-05-25) — `[fix-electrobun-build]`

A verification pass found that the "binary builds" claim above was **not actually true** when first
recorded: the "verify app builds" steps (`phase0-04` step 7, `desktop-shell-04` step 7,
`tray-polish-06`) had been marked `done` without the build succeeding — per `EXECUTION.md` they
should have been `blocked`. Concretely:

- **`electrobun.config.ts` did not match the installed Electrobun (v1.18.x) schema** (used a stale
  `{ entry, views }` shape + a non-existent `Config` type), so `bunx electrobun build` failed. It was
  also excluded from typecheck, hiding the breakage. → Rewritten to the `{ app, build: { bun, views,
  copy } }` schema; the binary now builds (app bundle with `bun/main.js`, `views/main/app.js`, and the
  copied CSP-hardened `index.html`).
- **The real Electrobun seams threw.** `realOpenWindowDeps` (`gui/window.ts`) and `realMountTrayDeps`
  (`gui/tray.ts`) were `throw`ing stubs — GUI mode would have crashed on launch. → Wired to the real
  `BrowserWindow` + bun-side RPC (delegating to the typed `ServerTransport`) and the real `Tray`
  (descriptor → `MenuItemConfig`, `tray-clicked` → `onClick`). Electrobun is loaded via a **lazy
  dynamic import** so `bun test` never pulls its native FFI module; the live window/tray behavior
  remains covered by the manual checklist (it needs a real macOS GUI run).
- **Typecheck gaps closed.** `@launchkit/ipc` had no `typecheck` script (silently ungated); added.
  `electrobun.config.ts` is now gated. Electrobun ships non-strict-compiling `.ts` source, so its
  small consumed surface is declared in `apps/desktop/src/types/electrobun-*.d.ts` and mapped via a
  typecheck-only `tsconfig.typecheck.json` (`paths`) — kept out of `tsconfig.json` so Bun's runtime
  and the Electrobun bundler still resolve the real module.
- **Root build wired.** `apps/desktop` now defines `build: electrobun build`, so `bun run build`
  (`turbo run build`) actually produces the binary (previously a no-op).

### CI/CD + release pipeline (2026-05-28) — `[ci-release-pipeline]`

Plan: `docs/superpowers/plans/2026-05-25-ci-release-pipeline.md` (spec:
`docs/superpowers/specs/2026-05-25-ci-release-pipeline-design.md`). CI was red because the `bun audit`
gate step failed on 8 advisories; the pipeline also built no artifacts.

- **Audit green, no ignores.** Bumped `happy-dom`→`^20` (critical RCE) and `turbo`→`^2.9.15`; added
  `overrides` for `uuid`/`jsondiffpatch`; migrated the Vercel AI SDK in `@launchkit/proxy` to **v6**
  (initially v5; bumped to v6 when a newly-published advisory, GHSA-866g-f22w-33x8, hit
  `@ai-sdk/provider-utils <=3.0.97` with a fix only in the provider-utils 4.x / ai@6 line). All
  `@ai-sdk/*` are on their v6 majors; `ollama-ai-provider-v2`→`^3`. The SDK stays isolated behind the
  `LanguageModelGateway`; `mapFullStreamPart` reads the high-level `fullStream` `text-delta.text` +
  `finish.finishReason`. `bun audit` exits 0 with **no** `--ignore`/`--audit-level` flags and stays a
  blocking step in `ci.yml` (bun pinned to 1.3.14).
- **Versions synced to 0.1.0** across root + app + all packages/tooling + `electrobun.config.ts`
  (root `package.json` is the release source-of-truth).
- **Standalone CLI binary.** `apps/desktop/src/cli.ts` (CLI-only entry, no Electrobun) + a `compile`
  script (`bun build --compile` → `apps/desktop/dist/launchkit-cli`); `cliDepsFrom` extracted to
  `cli-deps.ts` and shared with `main.ts`.
- **Workflows.** `canary.yml` (push→`main`: gate → 5-platform matrix build of app + CLI →
  `v0.1.0-canary.N` prerelease) and `release.yml` (`v*` tag: same gate+build → semver release).
  Non-mac Electrobun app builds are best-effort (`continue-on-error`), falling back to CLI-only.

**Follow-ups resolved (2026-05-28):**
- The pre-existing `apps/desktop/src/main.ts` CLI-mode argv bug (full `process.argv` forwarded to
  `runApp`→`runCli`, so the command parsed as `"bun"`) is **fixed**: an exported, testable
  `main(argv, deps)` slices the `[runtime, script]` prefix once (`detectMode` still reads raw
  `argv[2]`); regression tests cover both CLI and GUI entry wiring.
- `apps/desktop/src/cli.ts` now renders `CliError` via an exhaustive `formatCliError`
  (`launchkit: unknown command "x"`) instead of `JSON.stringify`; the `errOut` no-trailing-newline
  contract is documented and the argv-threading/formatter paths are tested.

**CI follow-ups resolved (2026-06-02):**
- **Failing test fixed.** `@launchkit/proxy` re-adds `msw` (devDep): `ai/test` imports it at module
  load, so a clean `--frozen-lockfile` install (CI) needs it — the earlier "drop unused msw" only
  passed on a stale local `node_modules`.
- **Skipped tests addressed.** The 3 `apps/desktop` e2e tests are platform-agnostic and were
  de-gated (run everywhere, incl. Linux CI); the macOS-only keychain integration test now runs via a
  new `ci.yml` `[ubuntu-latest, macos-latest]` matrix.
- **New advisory resolved at source** via the v5→v6 AI SDK migration (above). CI is green on both
  legs with a clean blocking audit.

### Runtime remediation (2026-06-02) — `[remediation/*]`

Plan: `docs/superpowers/plans/2026-06-02-launchkit-runtime-remediation.md`. A thorough review found
that "binary builds" was again masking "binary **runs**": the built `.app` launched but its own code
never executed, plus several functional gaps. Fixed via subagent-driven TDD on branch
`remediation/runtime-fixes` (gate green throughout: typecheck + lint + **487 tests**; `bun audit`
clean; `apps/desktop/scripts/smoke.sh` PASS).

- **P0 — GUI app never ran (the headline bug).** Electrobun's launcher loads `bun/index.js` via
  `new Worker(...)`, but the build emitted `bun/main.js` (entrypoint basename) **and** startup was
  gated behind `if (import.meta.main)` — always `false` in a Worker. So launching the `.app` started
  no proxy, no window, no tray. → New unconditional entry `apps/desktop/src/index.ts`; `main.ts` made
  side-effect-free; `electrobun.config.ts` entrypoint → `src/index.ts` (bundles to `bun/index.js`).
  Proven by a new runtime smoke script that builds, launches, and asserts the loopback proxy `/health`
  responds. `1d0878a`, `d3714c7`.
- **P0 process gap.** `MANUAL-VERIFICATION.md` was 100% unchecked — the GUI/tray/e2e runtime was never
  actually run, which is how P0 shipped as "done". The smoke script now guards the build-vs-runs gap
  in CI-able form; the eyes-on checklist (window/tray/launch-click/import-export) still requires a
  real GUI run.
- **P1 — GUI custom-harness CRUD silently lost data.** `addHarness`/`updateHarness`/`deleteHarness`
  echoed input but never persisted (`HarnessFileSource` was read-only). → Added
  `writeDefinition`/`deleteDefinition` (atomic 0600 write, path-traversal-safe ids) + registry
  `add`/`remove` (force `builtIn:false`, reject built-in ids) + wired the handlers to return the
  registry-normalized definition. `d4c0dd4`, `f90e976`, `82c1d90`.
- **P2 — install hardening.** AI SDK providers moved from `optionalDependencies` → `dependencies`
  (a degraded install now fails loudly, not silently at runtime). `1abbfde`. Root `README.md` added
  with verified build/install/run instructions for the dev `.app` + CLI. `832ed35`.
- **P3 — CLI proxy-key mismatch.** `launch` minted a fresh key even when reusing a running proxy
  (harness rejected by the live proxy). → New `RuntimeState` adapter (`@launchkit/proxy`) persists the
  per-run key to `~/.config/launchkit/runtime.json` (0600); GUI writes it on start / clears on stop;
  CLI reads it on reuse. `473b729`. Stale comment in `cli/src/run.ts` corrected (`a4e0d58`).
- **P4 — spawn lost the env + CLI orphaned the harness (`[remediation-bug2]`).** (a) `createBunProcessSpawner`
  passed only the 3 rendered template vars as `env`, which Bun.spawn treats as a full REPLACEMENT — the
  child got no PATH/HOME/TERM. → spawn with `{ ...process.env, ...env }` (rendered vars still win, keeping
  the proxy key/base-url authoritative). (b) The CLI returned immediately after spawning, orphaning an
  interactive TUI and killing the ephemeral proxy it had just started. → `ProcessSpawner.spawn` /
  `launchHarness` now return `{ pid, exited: Promise<number> }`; `launchCommand` foregrounds the harness
  (`await launched.value.exited`) and stops ONLY a proxy it owns (started this run) afterward — a reused,
  externally-running proxy is never stopped. GUI/tray launch stays fire-and-forget (uses `.pid` only).
  `079779d`.

**Known minor follow-ups (non-blocking, from code review):**
- Orphaned `.tmp` on a partial atomic-write failure (shared pattern in `runtime-state.ts` and
  `config/fs-config-file.ts` — best-effort `unlink` in the catch would close it).
- `runtime.json` has no port/PID metadata, so a GUI crash-without-stop + a different proxy on the port
  could hand a stale key (degrades to the same 401 as the original bug, only in that narrow window).
- The GUI's `writeProxyKey`/`clear` are fire-and-forget — a CLI launch racing GUI startup may read
  `null` and fall back to minting (graceful 401, not a crash).
- Inbound proxy parsers don't re-validate through `NormalizedRequestSchema` (e.g. `temperature`
  unbounded) — cosmetic; providers reject invalid values.

### Embedded harness terminal (2026-06-03) — `[terminal-*]`

Spec: `docs/superpowers/specs/2026-06-02-embedded-harness-terminal-design.md`. Plan:
`docs/superpowers/plans/2026-06-02-embedded-harness-terminal.md`. GUI **Launch** previously recorded a
session but never surfaced the harness (the GUI has no controlling terminal, so the headless
inherit-stdio spawn was invisible). Now GUI launch opens the harness in an **embedded, interactive,
tabbed** terminal inside the window. Built subagent-driven via TDD (gate green throughout: typecheck +
lint + **538 tests**; `bun audit` clean; `bunx electrobun build` exit 0; `smoke.sh` PASS). The live
xterm round-trip is the one item that needs an eyes-on GUI run (`MANUAL-VERIFICATION.md` Terminal
section).

- **New package `@launchkit/pty`.** Pure, fully unit-tested core — `createFakePty`, bounded scrollback
  ring buffer, `createTerminalRegistry`, a zod-validated message protocol (`PtyInbound`/`PtyOutbound`,
  base64 byte-safe codec), and `createTerminalManager` (ties pty ↔ webview ↔ `SessionStore`; registers
  the single-subscriber `onData`/`onExit` once and fans out; closes the session with the exit code on
  harness exit). `3bc5e80`,`1e57ba4`,`d052e81`,`adb6a92`,`66453c4`,`7f50500`,`f2a502d`,`d3fe421`,`c2b79b7`.
- **Real PTY with zero native deps.** `createFfiPty` uses `bun:ffi` `openpty` (libutil) + `Bun.spawn`
  on the slave fd — the child gets a real TTY (verified by integration test). Non-blocking master
  drain, ioctl `TIOCSWINSZ` resize, fd-leak-safe on spawn failure. `ac39ab9`,`2ef3604`.
- **Bun-side wiring.** `resolveHarnessLaunch` extracted from `launchHarness` for reuse (`beb375a`);
  `composition.ts` builds `ctx.terminal` (`d788428`); `gui/window.ts` wires Electrobun's bidirectional
  `messages` channel under a single `"pty"` name — inbound → `routeInboundMessage` → manager, outbound
  bound via `terminal.bindSend(m => rpc.send("pty", m))` (`cd56f27`); the GUI `launchHarness` handler +
  tray Launch now call `ctx.terminal.launch` (reusing the running proxy's key) and return `{sessionId}`
  — the manager is the sole session creator, no duplicates; the CLI path is untouched (`6136c32`).
- **Webview UI.** A browser-safe `@launchkit/pty/protocol` subpath export keeps `bun:ffi` out of the
  view bundle; `terminalClient`/`useTerminals` (`4c3b130`) + a new **Terminal** route with a tab strip
  and `@xterm/xterm` pane (`124afa1`). Launch navigates to the new tab; scrollback survives tab
  switches; closing a tab kills the harness; xterm is loaded via dynamic import so `bun test` never
  pulls it.

### Embedded terminal — runtime fixes (2026-06-04) — `[remediation/runtime-fixes]`

Eyes-on GUI runs surfaced a garbled harness TUI; root-caused and fixed end-to-end (gate green:
typecheck + lint + **540 tests**; new pty integration tests; `electrobun build` exit 0; `smoke.sh`
PASS; headless-xterm replay of real `claude` output renders its clean TUI at the right width).

- **PTY window size was garbage (the headline bug).** `ioctl(TIOCSWINSZ)`'s `struct winsize *` is a
  **variadic** argument, and bun:ffi mis-passes varargs on arm64 (the same defect already noted for
  `fcntl`): the pointer went in a register but the variadic callee reads it off the stack, so the
  kernel stored an uninitialised winsize (`stty size` reported e.g. `45187×1786`). The harness then
  rendered its Ink TUI for a ~1786-column terminal — stray accumulating `────` rules, content emitted
  at impossible columns (`ESC[1778G`), right-edge wrapping. Fix: set the **initial** size via
  `openpty`'s **fixed** `winp` parameter (reliable, and atomic before the child reads it), and do
  **resize** through a second ioctl binding **padded with 6 dummy register args** so the real pointer
  lands on the stack where the variadic call reads it. New integration tests assert the child's TTY
  reports exactly the requested size on both open and resize. (Supersedes the `TIOCSWINSZ resize` note
  above, which was silently writing garbage.)
- **Dedicated loopback PTY WebSocket.** The high-frequency byte stream + the TUI's startup capability
  queries (DA1, cursor reports) degraded over Electrobun's `messages` channel. Moved the pty stream to
  a loopback `ws://localhost:<port>` (`gui/terminal-socket.ts`, fetched via a `getTerminalSocketUrl`
  IPC method); IPC requests stay on Electrobun. Removed the `messages:{pty}` channel from `window.ts`.
- **xterm robustness.** WebGL renderer promoted only **after** the first valid fit (a 0×0 container at
  `open()` mis-measured the cell); `fit()` validates the proposed grid and refuses absurd dimensions
  so a bad measurement can never resize the pty. Deferred the pty spawn to the first real resize
  (spawn at the webview's true size, no startup churn). CSP allows `ws://localhost:*`; added a webview
  `ErrorBoundary` and the hand-written `app.css` theme + vendored `xterm.css`.

### Session-centric master/detail redesign (2026-06-04) — `[session-redesign]`

Spec: `docs/superpowers/specs/2026-06-04-session-master-detail-redesign-design.md`.
Plan: `docs/superpowers/plans/2026-06-04-session-master-detail-redesign.md`.
Reworks the GUI into a session-first master/detail workspace (vertical paginated session
list + click-to-open terminal detail), moves config behind a Settings toggle, and adds
launch presets (profiles), session name/cwd, file-based scrollback persistence, and CLI parity.
Executed via `subagent-driven-development` (implementer + spec review + code-quality review per task).

| ID | Task | Status | Commit |
|---|---|---|---|
| T.1 | types: `ProfileId` branded id | done | 4f2c6cb |
| T.2 | types: `Profile` schema + type | done | 4f40034 |
| T.3 | types: `Session` optional `name`/`cwd` (min(1)) | done | 529e54e, 6ce52fe |
| T.4 | types: barrel exports | done | d7945f1 |
| CS.1 | config: `profiles[]` schema + version 3 + defaults | done | 889f20e |
| CS.2 | config: `v2→v3` migration | done | 6fac4c1 |
| CS.3 | sessions: `SessionInput`/`SessionFilter` shapes | done | cff3a6a |
| CS.4 | sessions: idempotent `name`/`cwd` column add | done | 43adc56 |
| CS.5 | sessions: `create` writes `name`/`cwd` | done | 3d9b5d5 |
| CS.6 | sessions: `query` running/limit/offset (+offset-only fix) | done | 9205194, 6c55140 |
| CS.7 | config/sessions barrel guards | done | 8fe2bea |
| PH.1–PH.6 | pty: file `ScrollbackStore` (+ fakes, rotation, real fs O_APPEND) | done | 7bcff78…d26c252, dfc5373 |
| PH.7–PH.9 | pty: `cwd`/`name` threading + scrollback tap + composition wiring | done | 3f79580, 100df50, a2e63ef, 2efa088 |
| PH.10–PH.11 | harnesses: `ProcessSpawner` cwd + `LaunchParams` cwd/env merge | done | 424ebb6, cc00446 |
| I.1–I.7 | ipc: profiles/pickFolder/scrollback + launch/getSessions params (desktop stubs throw; Phase 7 replaces) | done | 32c2c2d…dd4457c |
| C.1–C.6 | cli: profiles CRUD + `launch --profile/--name/--cwd` | done | 5f7279e…6055db6 |
| U.1–U.12 | ui: Modal/SessionRow/SessionList/NewSessionModal/ProfileForm/AppShell… (+review: empty-state add, folder-sync, modal reset, a11y) | done | bc7a7fc…0ac4c17, 3ae20a3, aa204fe |
| D.1–D.12 | desktop: handlers, composition, replay, app.tsx master/detail (+review: live→replay lifecycle, refetch on launch/exit, dead-page cleanup) | done | bdd565a…93a49b9, 553e906, 441d61e, 3565dcc |
| FINAL | whole-repo gate + runtime verification | done | 7f96014 |

**Status: complete.** Gate green end-to-end — `bun run typecheck` (12/12) + `bun run lint` (353 files,
clean) + `bun test` (**737 pass, 0 fail**); `bunx electrobun build` exit 0; `apps/desktop/scripts/smoke.sh`
PASS (app launches, proxy bound to loopback, `/health` ok). Built subagent-driven via TDD (implementer +
spec-compliance review + code-quality review per phase; review found + fixed real bugs incl. an
offset-without-LIMIT SQL error, a non-append scrollback writer + missing scrollback dir, a NewSessionModal
Browse-wipes-form bug, and the live→replay session-lifecycle reconciliation). The eyes-on items (live xterm
round-trip, native folder dialog, replay rendering) remain in `apps/desktop/MANUAL-VERIFICATION.md` for a real
macOS GUI run. Follow-ups (non-blocking): surface launch/profile/dialog `Result` errors in the UI; bidirectional
hash↔view (back/forward); Settings → General config import/export; global scrollback retention sweep.

## Status legend
`todo` · `in-progress` · `done` · `blocked`

## Selection rule
A task is **runnable** when its status is `todo` AND every dependency is `done`. Pick the first runnable task top-to-bottom.

**Dependency convention:** within a package, each task depends on the previous one (`xxx-02` needs `xxx-01`). The **Deps** column lists only *cross-package* dependencies; a blank Deps cell means the task depends solely on the previous task in its package (or nothing, for the very first task). Cross-package deps reference another package's **barrel task** (its last task), which means that package is fully built.

---

## Package overview

| Order | Package | Plan file | Ready when these are `done` | Tasks | Status |
|---|---|---|---|---|---|
| 0 | bootstrap | `04-plans/00-phase0-bootstrap.md` | — | 6 | done |
| 1 | types | `04-plans/01-types.md` | phase0-06 | 7 | done |
| 1 | utils | `04-plans/02-utils.md` | phase0-06 | 7 | done |
| 2 | secrets | `04-plans/03-secrets.md` | types-07, utils-07 | 5 | done |
| 2 | ipc | `04-plans/04-ipc.md` | types-07, utils-07 | 5 | done |
| 2 | config | `04-plans/05-config.md` | types-07, utils-07 | 7 | done |
| 2 | sessions | `04-plans/06-sessions.md` | types-07, utils-07 | 7 | done |
| 2 | harnesses | `04-plans/08-harnesses.md` | types-07, utils-07 | 7 | done |
| 2 | ui | `04-plans/10-ui.md` | types-07, utils-07 | 7 | done |
| 3 | proxy | `04-plans/07-proxy.md` | types-07, utils-07, config-07, secrets-05 | 13 | done |
| 4 | cli | `04-plans/09-cli.md` | config-07, secrets-05, proxy-13, harnesses-07, sessions-07 | 6 | done |
| 4 | gui-pages | `04-plans/12-gui-pages.md` | ui-07, ipc-05 | 7 | done |
| 5 | desktop-shell | `04-plans/11-desktop-shell.md` | cli-06, ipc-05, proxy-13, harnesses-07, sessions-07, config-07, secrets-05 | 5 | done |
| 6 | tray-polish | `04-plans/13-tray-and-polish.md` | desktop-shell-05, gui-pages-07 (per-task deps below) | 6 | done |

**Parallelism:** Order-1 (types, utils) → Order-2 (six packages, fully parallel) → proxy → {cli, gui-pages} → desktop-shell → tray-polish. Dispatch parallel subagents per the orchestrator section of `EXECUTION.md`.

**Total: 95 tasks.**

---

## 0 — bootstrap (`00-phase0-bootstrap.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| phase0-01 | Root workspace + tooling presets | — | done | dc16c70 |
| phase0-02 | `bun test` + DOM smoke test (first RED→GREEN) | | done | 5df3a34 |
| phase0-03 | Root `CLAUDE.md` + resume/new-package skills | | done | 8682ba4 |
| phase0-04 | Initialize the Electrobun app shell | | done | 513538a |
| phase0-05 | CI workflow | | done | 6accec6 |
| phase0-06 | Green-gate verification + cleanup | | done | c498942 |

## 1 — types (`01-types.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| types-01 | SdkProvider & ApiFormat enums | phase0-06 | done | 9f1fe79 |
| types-02 | Branded ids & SecretRef | | done | 90c670a |
| types-03 | Provider | | done | cac2540 |
| types-04 | ModelAlias | | done | 53c2527 |
| types-05 | HarnessDefinition | | done | 59ce2e9 |
| types-06 | Session | | done | 0db5613 |
| types-07 | Barrel + package CLAUDE.md | | done | fa50d2a |

## 1 — utils (`02-utils.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| utils-01 | Result core (`ok`/`err`/`isOk`/`isErr`) | phase0-06 | done | 847c341 |
| utils-02 | Result combinators | | done | 2ef4f67 |
| utils-03 | `pipe` & `flow` | | done | 5d35dc9 |
| utils-04 | `renderTemplate` | | done | 7bc92b5 |
| utils-05 | `redactSecrets` | | done | 7f4c639 |
| utils-06 | `Clock` & `IdGen` effect interfaces + adapters | | done | defcdb6 |
| utils-07 | Barrel + CLAUDE.md | | done | f221ab2 |

## 2 — secrets (`03-secrets.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| secrets-01 | SecretError + KeychainBackend interface + in-memory fake | types-07, utils-07 | done | 7c2a30e |
| secrets-02 | createSecretStore (set/get/delete/has) | | done | 38fb329 |
| secrets-03 | createMacosSecurityBackend (arg arrays + redaction) | | done | cd4d332 |
| secrets-04 | createBunProcessRunner + darwin-only integration | | done | 4ff2c10 |
| secrets-05 | Barrel + package CLAUDE.md | | done | 3d1fdd8 |

## 2 — ipc (`04-ipc.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| ipc-01 | `ProviderView` + `ProviderViewSchema` (secret-free) | types-07, utils-07 | done | |
| ipc-02 | Per-method Params/Result schemas + `IpcMethods` map | | done | |
| ipc-03 | `ClientTransport` + `createIpcClient` | | done | |
| ipc-04 | `ServerTransport` + `createIpcServer` | | done | |
| ipc-05 | In-memory transport pair, barrel + CLAUDE.md | | done | |

## 2 — config (`05-config.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| config-01 | Settings + Config schemas + defaultConfig | types-07, utils-07 | done | |
| config-02 | Migration type + migrations + runMigrations | | done | |
| config-03 | ConfigFile interface + in-memory fake | | done | |
| config-04 | createFileConfigStore.load | | done | |
| config-05 | createFileConfigStore.save (atomic) | | done | |
| config-06 | createCachedConfigStore | | done | |
| config-07 | Barrel + package CLAUDE.md | | done | |

## 2 — sessions (`06-sessions.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| sessions-01 | SessionError + Database interface + recording fake | types-07, utils-07 | done | 91fbc66 |
| sessions-02 | createSessionStore.init (schema + indexes) | | done | 2ed92c0 |
| sessions-03 | create (parameterized INSERT) | | done | d6f5988 |
| sessions-04 | close (parameterized UPDATE; not-found) | | done | f1347f0 |
| sessions-05 | query (parameterized WHERE) | | done | 125c6fe |
| sessions-06 | createBunSqliteDatabase + integration round-trip | | done | c9853d5 |
| sessions-07 | Barrel + package CLAUDE.md | | done | 884ceab |

## 2 — harnesses (`08-harnesses.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| harnesses-01 | Built-in definitions + `builtinHarnesses` list | types-07, utils-07 | done | |
| harnesses-02 | `HarnessError` + `validateEnvTemplate` | | done | |
| harnesses-03 | `HarnessFileSource` + fake + `createRegistry` | | done | |
| harnesses-04 | `CommandResolver` + `ProcessSpawner` + fakes | | done | |
| harnesses-05 | `launchHarness` | | done | |
| harnesses-06 | Real adapters + integration test | | done | |
| harnesses-07 | Barrel + package CLAUDE.md | | done | |

## 2 — ui (`10-ui.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| ui-01 | Button, StatusDot, Spinner (atoms) | types-07, utils-07 | done | 4eb21a6 |
| ui-02 | TextInput, Select, Badge, Label (atoms) | | done | 4eb21a6 |
| ui-03 | FormField, EmptyState (molecules) | | done | 4eb21a6 |
| ui-04 | ProviderCard, AliasRow (molecules) | | done | 4eb21a6 |
| ui-05 | ProviderList, AliasTable (organisms) | | done | 4eb21a6 |
| ui-06 | HarnessForm, SessionTable (organisms) | | done | 4eb21a6 |
| ui-07 | AppShell, SettingsLayout + barrels + CLAUDE.md | | done | 4eb21a6 |

## 3 — proxy (`07-proxy.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| proxy-01 | Internal request/stream types + ProxyError | types-07, utils-07, config-07, secrets-05 | done | 6d3d967 |
| proxy-02 | Request authentication | | done | 7407330 |
| proxy-03 | Anthropic inbound parser | | done | b9f9f77 |
| proxy-04 | OpenAI inbound parser | | done | 0561ec1 |
| proxy-05 | Anthropic SSE serializer | | done | 6eeb268 |
| proxy-06 | OpenAI SSE serializer | | done | 2996f1b |
| proxy-07 | Alias router | | done | ee1c513 |
| proxy-08 | Provider factory (secrets + lazy SDK + cache) | | done | cf45b00 |
| proxy-09 | LanguageModelGateway interface + fake | | done | 2622ec7 |
| proxy-10 | Request handler (wiring, no real network) | | done | c0fadc0 |
| proxy-11 | startProxy + isProxyRunning + integration test | | done | 09822a4 |
| proxy-12 | Real SDK loader + real gateway (integration) | | done | b5e1c6c |
| proxy-13 | Barrel + provider config schemas + CLAUDE.md | | done | 832780e |

## 4 — cli (`09-cli.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| cli-01 | `parseArgs` (pure argv tokenizer) | config-07, secrets-05, proxy-13, harnesses-07, sessions-07 | done | d800070 |
| cli-02 | `Writer` + `CliError` + `CliDeps` + `runCli` dispatch | | done | cf38426 |
| cli-03 | `list harnesses \| providers \| aliases` | | done | 9d88c5d |
| cli-04 | `launch <harnessId> [--model <alias>]` | | done | 5366de8 |
| cli-05 | `add` / `remove` provider + alias | | done | d013c06 |
| cli-06 | Barrel + package CLAUDE.md | | done | e4448e8 |

## 4 — gui-pages (`12-gui-pages.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| gui-pages-01 | Electrobun transport + `IpcClientContext` + fake client | ui-07, ipc-05 | done | ea1a1b2 |
| gui-pages-02 | The five data hooks over the injected client | | done | c3f661d |
| gui-pages-03 | `ProvidersPage` (no secret values + setProviderSecret) | | done | 32b5170 |
| gui-pages-04 | `RoutingPage` | | done | e1d51b7 |
| gui-pages-05 | `HarnessesPage` | | done | 79acf25 |
| gui-pages-06 | `SessionsPage` (filters + virtualization) | | done | 1d68580 |
| gui-pages-07 | `DashboardPage` + `app.tsx` router + `index.html` (CSP) | | done | 0910878 |

## 5 — desktop-shell (`11-desktop-shell.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| desktop-shell-01 | `runApp` mode router | cli-06, ipc-05, proxy-13, harnesses-07, sessions-07, config-07, secrets-05 | done | 24447a7 |
| desktop-shell-02 | `createIpcHandlers` (secret-masking boundary) | | done | 79ae95f |
| desktop-shell-03 | `createAppContext` (real-adapter wiring) | tray-polish-03 | done | f6ce6d6 |
| desktop-shell-04 | `openWindow` (Electrobun seam) + flesh out `main.ts` | | done | 08a79ab |
| desktop-shell-05 | `apps/desktop` CLAUDE.md + full gate | | done | 8827728 |

## 6 — tray-polish (`13-tray-and-polish.md`)

| ID | Task | Deps | Status | Commit |
|---|---|---|---|---|
| tray-polish-01 | `buildTrayMenu` pure fn + `TrayMenu`/`TrayItem` types | harnesses-07 | done | 47e1c50 |
| tray-polish-02 | `mountTray` Electrobun seam + click routing | desktop-shell-04 | done | 80f5656 |
| tray-polish-03 | `createProviderTester` (connectivity probe) | proxy-13 | done | 47e1c50 |
| tray-polish-04 | `exportConfig` / `importConfig` (pure round-trip) | config-07 | done | d807370 |
| tray-polish-05 | Final end-to-end / integration verification | desktop-shell-05, gui-pages-07, tray-polish-02, tray-polish-03, tray-polish-04 | done | d14cfe7 |
| tray-polish-06 | Wrap-up — whole-repo gate green + finalize ledger | tray-polish-05 | done | 3173fb2 |

---

## Integration seams (cross-plan wiring notes)

A few tasks live in one package but are wired in by another. These are intentional and the dependencies above already encode them — called out here so no agent is surprised:

- **`createProviderTester` (tray-polish-03)** is implemented in `packages/proxy` (it needs the factory + gateway) and is runnable right after `proxy-13`. The desktop `testProvider` IPC handler (`desktop-shell-02`) calls it via `AppContext.testProvider`, which `createAppContext` (`desktop-shell-03`) constructs — hence `desktop-shell-03` depends on `tray-polish-03`. Run `tray-polish-03` early (alongside `cli`/`gui-pages`), not at the end.
- **`mountTray` (tray-polish-02)** adds a call into `apps/desktop/src/main.ts`'s GUI path, which `desktop-shell-04` creates first — hence the `desktop-shell-04` dependency.
- **`exportConfig`/`importConfig` (tray-polish-04)** are added to `@launchkit/config` (so the CLI and IPC handlers can both reuse them); they only depend on `config-07`.
