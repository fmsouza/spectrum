# Session-centric master/detail redesign — design

**Date:** 2026-06-04
**Status:** approved (brainstorm) → ready for implementation plan
**Spec author:** brainstorm session (visual companion used for layout decisions)

## 1. Summary & goals

Today LaunchKit is a multi-page tool: a Dashboard with quick-launch buttons, five sidebar
pages (Dashboard, Providers, Routing, Harnesses, Sessions), and a separate tabbed Terminal
page. Sessions are a side-effect of launching a harness from the Dashboard and are surfaced
only as a flat history table.

This redesign makes **the session the primary object** and reorganizes the app into a
**master/detail workspace**:

- A vertical, paginated **session list** is the master view.
- The selected session's **terminal** fills the detail view (live for running sessions,
  read-only replay for ended ones).
- All configuration (Providers, Routing, Harnesses, plus new Profiles and a General section)
  moves behind a **Settings** toggle.
- Starting a session becomes a deliberate, configurable action via a **modal**.
- Two new capabilities support this: **launch presets ("profiles")** and **durable
  per-session scrollback** so ended sessions stay reviewable across app restarts.

## 2. Scope

**In scope**

- New app shell: icon rail + master + detail.
- Session list: running sessions pinned in their own group; recent/ended sessions paginated
  (20 per page + "View more"); three-line rows.
- Detail view: live interactive terminal (unchanged behavior) and read-only replay terminal
  for ended sessions, with an exit banner.
- Settings area as its own master/detail: General, Providers, Routing, Harnesses, Profiles.
- New-session modal: profile selector that prefills editable fields; per-session Name +
  Folder (native folder picker); Harness/Model/Env overrides; "Save edits as new profile".
- New **Profile** concept: type, config-backed storage, CRUD, IPC.
- Session model gains `name` and `cwd`.
- File-based per-session scrollback persistence.
- All supporting IPC methods and backend wiring.
- TDD throughout; gate (`typecheck && lint && test`) green per task.

**Out of scope (documented follow-ups)**

- CLI parity for profiles / `cwd` (the modal is GUI-only for now).
- Reconnecting to a *live* harness process after an app restart — children die with the app;
  impossible without a background daemon.
- Global disk-retention sweep for old scrollback files (per-session bound only for now).
- Session rename / delete / search UI.

## 3. Decisions captured (brainstorm)

| Question | Decision |
|---|---|
| What is "profile"? | A reusable **launch preset**; **name** and **folder** are per-session, not part of the preset. |
| What does a preset contain / is harness separate? | Preset bundles harness + model (+ env) and **prefills** the modal; **all fields stay editable** per session. |
| Click an ended session → detail shows? | **Read-only terminal** of its last output. |
| Scrollback persistence scope? | **Persist to disk now.** |
| Overall shell layout? | **Icon rail + list + detail** (VS Code-style). |
| Session row design? | **Three-line** (name+badge / harness·model / folder·time); **running pinned** in a top group. |
| Settings organization? | **Master/detail**, mirroring the session view. |
| New-session modal layout? | **Grouped**: "This session" (name, folder) vs "Launch config — prefilled · editable" (harness, model, env). |
| Folder input? | **Native folder picker.** |
| Scrollback storage medium? | **Stream chunks → flat file** (2-file rotation for bounding). |

## 4. UX architecture

### 4.1 Shell (three zones)

- **Rail** (thin, far left): app icon; **Sessions** toggle; **Settings** toggle; proxy-status
  dot pinned at the bottom.
- **Master** (middle): session list (Sessions mode) or settings nav (Settings mode).
- **Detail** (right): selected session's terminal, or selected settings section.

### 4.2 Master — session list

- **"+ New session"** button pinned at the top.
- **Running** group (pinned, not paginated — there are few) then **Recent** group (ended,
  newest first).
- **Three-line rows**: line 1 `●/○ name + status badge` (running / `exit 0` in green /
  `exit N` in red); line 2 `harness · model`; line 3 `folder · relative time`.
- **Pagination**: Recent shows 20; **"View more"** loads the next 20.

### 4.3 Detail — terminal

- **Live session**: interactive xterm, exactly like today. All open live panes stay
  **mounted but hidden** when not selected (preserves PTY state and scrollback). The vertical
  list replaces the current tab strip as the selection mechanism.
- **Ended session**: a **read-only** xterm that replays persisted scrollback from disk, with
  a header banner (`exited · code N · ended <time>`). Works across restarts.
- **Empty state**: prompt to start a session (no session selected, or none exist yet).

### 4.4 Settings (master/detail, mirrors sessions)

The rail's Settings toggle swaps the master into a settings nav
(**General · Providers · Routing · Harnesses · Profiles**); the detail shows the section.

- **General**: proxy status + start/stop; import/export config.
- **Providers / Routing / Harnesses**: today's pages, relocated essentially unchanged.
- **Profiles**: new CRUD (mirrors the Harnesses/Routing CRUD patterns).

### 4.5 New-session modal (grouped)

- **Profile (preset)** selector on top, including a "Custom / none" option (start without a
  preset). Selecting a profile prefills the editable fields below.
- **This session** group: Name (text), Folder (text + native **Browse…**).
- **Launch config — prefilled · editable** group: Harness (select), Model (select),
  Env overrides.
- Footer: **"☐ Save edits as new profile"** + Cancel / Start.

Field-level notes (to remove ambiguity):

- **"Model"** in the UI is the routing **alias** (`AliasName`, e.g. `default` / `fast`),
  consistent with the existing launch semantics (`LaunchHarnessParams.alias`) and the row
  display (`harness · model`). It is not a raw provider model string.
- **Env overrides** is a small key/value editor (add/remove rows), prefilled from the
  selected profile's `env` and editable per session.
- **"Save edits as new profile"**, when checked, reveals a profile-name field; on Start the
  resolved harness/model/env are saved as a new `Profile` via `addProfile` (Name and Folder
  are not part of the profile).

### 4.6 Navigation state model

Keep the existing no-router, state-driven approach. Replace the flat `route: Route` with a
view model:

```ts
type View =
  | { kind: "sessions"; selectedSessionId?: SessionId }
  | { kind: "settings"; section: SettingsSection }
```

Serialize to the URL hash for reload persistence (e.g. `#sessions/s_abc`,
`#settings/profiles`). The rail toggles `kind`. Launching a session sets
`{ kind: "sessions", selectedSessionId: <new id> }`.

## 5. Data model & persistence

### 5.1 New type: `Profile` (`@launchkit/types`)

```ts
// ids.ts
export const ProfileIdSchema = z.string().min(1).brand<"ProfileId">()

// profile.ts
export const ProfileSchema = z.object({
  id: ProfileIdSchema,
  name: z.string().min(1),
  harnessId: HarnessIdSchema,
  alias: AliasNameSchema,
  env: z.record(z.string(), z.string()),   // overrides; default {}
}).strict()
export type Profile = z.infer<typeof ProfileSchema>
```

A profile is a reusable launch preset that the modal reads to prefill. It does **not**
hard-bind a session: because fields stay editable, a session records the *resolved* launch
values, not a profile reference.

### 5.2 Session gains `name` + `cwd` (`@launchkit/types`, `@launchkit/sessions`)

- `SessionSchema` adds `name: z.string().optional()` and `cwd: z.string().optional()`
  (optional keeps existing rows/DBs valid; `.strict()` preserved).
- The sessions DB has **no migration mechanism** (only `CREATE TABLE IF NOT EXISTS`).
  `store.init()` gains an **idempotent column-add**: read `PRAGMA table_info(sessions)`,
  then `ALTER TABLE sessions ADD COLUMN name TEXT` / `... cwd TEXT` only when absent. Uses
  the existing `Database.all()` / `Database.exec()` — no new adapter surface.
- `create()` input extends to `{ harnessId, alias, name?, cwd? }`; the INSERT includes the
  new columns. `query()`/`close()` select the new columns; otherwise unchanged.

### 5.3 Config: `profiles[]` + migration (`@launchkit/config`)

- `ConfigSchema` adds `profiles: z.array(ProfileSchema)` (top-level, alongside
  `providers`/`aliases`); `defaultConfig()` adds `profiles: []`.
- Bump `CURRENT_CONFIG_VERSION` 2 → 3; add a `v2ToV3` migration that injects
  `profiles: []` when missing. Follows the existing ordered `runMigrations` pattern.
- Profile CRUD reuses the config store (load → mutate array → atomic save), exactly like
  providers/aliases.

### 5.4 Scrollback persistence — file-based (`@launchkit/pty`)

New injected adapter (effects behind an interface, per functional-style rules):

```ts
interface ScrollbackStore {
  append(id: SessionId, chunk: Uint8Array): Result<void, PtyError>
  read(id: SessionId): Result<Uint8Array, PtyError>   // concat of rotation files
  close(id: SessionId): Result<void, PtyError>         // flush + close writer
}
```

- **Real adapter** `createFileScrollbackStore({ dir, capBytes })`:
  - Per live session keeps a `Bun.FileSink` writer at `<dir>/<id>.bin`.
  - `append` writes and tracks size; on crossing `capBytes`, **rotate**: `<id>.bin` →
    `<id>.1.bin` (replacing any previous `.1.bin`), open a fresh `<id>.bin`. On-disk bound
    is `[capBytes, 2·capBytes)` with no mid-stream rewrites (just a rename).
  - `read` returns `concat(<id>.1.bin?, <id>.bin)`.
  - `id` is validated to contain no path separators / `..` before any fs access
    (path-traversal safe).
  - Defaults: `dir = ~/.config/launchkit/scrollback`, `capBytes = 1 MiB`.
- **In-memory fake** for unit tests.

Ended sessions always replay from the file store (independent of the in-memory ring buffer,
which continues to serve live sessions).

## 6. Backend wiring

- **`cwd`/`name` threading**: `TerminalLaunchInput` (`@launchkit/pty`) gains `name?`, `cwd?`.
  `manager.launch` passes them to `sessions.create(...)`; `spawnPty` passes `cwd` to
  `pty.open({ ..., cwd })`; the FFI pty's `Bun.spawn` receives `{ cwd }`. The CLI's
  `ProcessSpawner` / `launchHarness` (`@launchkit/harnesses`) are left unchanged (CLI parity
  is a follow-up).
- **Scrollback tap**: the manager already does
  `pty.onData(chunk) → registry.appendData(id, chunk)`. Add a parallel
  `scrollback.append(id, chunk)`; on `pty.onExit`, call `scrollback.close(id)` alongside
  `sessions.close(...)`. Live behavior is unchanged; the file is the durable mirror.
- **Composition** (`apps/desktop/src/composition.ts`): construct
  `createFileScrollbackStore(...)`, inject it into the terminal manager, and expose a read
  path for the scrollback IPC handler.

## 7. IPC surface (`@launchkit/ipc` + desktop handlers)

**New methods**

- `getProfiles → Profile[]`
- `addProfile(Profile without id) → Profile`
- `updateProfile(Profile) → Profile`
- `deleteProfile({ id }) → void`
- `pickFolder({ startingFolder? }) → { path?: string }` — bun-side handler calls Electrobun
  `Utils.openFileDialog({ canChooseDirectory: true, canChooseFiles: false,
  allowsMultipleSelection: false, startingFolder })` and returns the first path (or none if
  cancelled). Extend `apps/desktop/src/types/electrobun-bun.d.ts` with the
  `Utils.openFileDialog` type. The native call sits behind the existing lazy-import seam, as
  with the tray/window seams, so `bun test` never loads native FFI.
- `getSessionScrollback({ id }) → { bytesBase64: string }` — reads the file store; base64
  over IPC (mirrors the existing pty byte codec).

**Changed methods**

- `LaunchHarnessParams`: `{ id, alias? }` → `{ id, alias?, name?, cwd?, env? }`
  (`env` = resolved overrides from the modal). The GUI handler routes through
  `ctx.terminal.launch` with these.
- `GetSessionsParams`: add `running?: boolean`, `limit?`, `offset?` for server-side
  pagination. `query()` adds an `endedAt IS [NOT] NULL` predicate and `LIMIT`/`OFFSET`. The
  running group is fetched with `running: true`; the Recent group is paginated. `Session`
  results now carry `name`/`cwd`.

New IPC methods follow the standard end-to-end path: schema in `methods.ts` →
auto-generated client method (`createIpcClient`) → handler in
`apps/desktop/src/gui/ipc/handlers.ts` via `AppContext`.

## 8. Frontend component architecture (atomic design)

Rule honored: **dumb components never fetch; data enters at the page level.**

### 8.1 `@launchkit/ui` (pure, presentational)

- **atoms**: `Modal` (overlay, focus trap, Esc/backdrop close), `IconButton` (rail). Reuse
  existing `Button` / `TextInput` / `Select` / `Badge` / `StatusDot` / `Label` / `Spinner`.
- **molecules**: `SessionRow` (three-line, status badge, selected state); `RailItem`;
  `FolderField` (TextInput + Browse button; emits `onBrowse` — never calls IPC itself).
- **organisms**:
  - `SessionList` — running + recent groups, "View more", selection. Props: `running`,
    `recent`, `hasMore`, `selectedId`, `onSelect`, `onMore`, `onNew`.
  - `SettingsNav` — settings section list.
  - `NewSessionModal` — grouped form. Props: `profiles`, `harnesses`, `aliases`,
    `folder`, `onBrowse`, `onSubmit`, `onCancel`. Prefill-from-profile is local derived
    state; submit/browse are delegated to the page.
  - `ProfileList` + `ProfileForm` — Profiles CRUD UI (mirrors `HarnessForm` / `AliasTable`).
  - `TerminalPane` gains `mode: 'live' | 'replay'`. `replay` skips input wiring and writes a
    provided byte buffer once (read-only). The injected `XtermInstance` seam is retained so
    tests stay headless.
- **templates**: `AppShell` reworked to **rail + master + detail** (props: `mode`,
  `onModeChange`, `proxyRunning`, `master`, `detail`). `SettingsLayout` reused for section
  panes.

### 8.2 `apps/desktop/views/main` (data-aware)

- **`app.tsx`** owns the `View` model, hash sync, and master+detail composition per mode. It
  holds the set of open live panes (mounted-but-hidden) keyed by session id — the vertical
  list drives selection, replacing `TabStrip` and the tabbed `TerminalPage`.
- **hooks**: `useProfiles` (CRUD over the injected client); `useSessionScrollback(id)`
  (fetch replay bytes); `useSessions` extended for the running/paginated split. New-session
  submit and `pickFolder` are page-level calls passed down as callbacks.
- **section renderers**: `SessionsView` (master = list; detail = terminal/replay/empty);
  `SettingsView` (master = nav; detail = section). Existing `ProvidersPage` / `RoutingPage`
  / `HarnessesPage` slot into Settings sections largely unchanged. `DashboardPage` is retired
  (quick-launch → modal; proxy status → rail + General).

## 9. Launch flow (end-to-end)

1. Click **+ New session** → `NewSessionModal` opens (profiles/harnesses/aliases already
   loaded at page level).
2. Pick a **Profile** → harness/model/env prefill (editable). Type **Name**; click
   **Browse…** → page calls `pickFolder` IPC → native dialog → folder fills in.
3. **Start** → page calls `launchHarness({ id: harnessId, alias, name, cwd, env })`.
   If "Save edits as new profile" is checked, also `addProfile(...)`.
4. Backend: GUI handler → `ctx.terminal.launch` → `sessions.create({ harnessId, alias, name,
   cwd })` → deferred spawn at first resize → `Bun.spawn({ cwd })`; PTY bytes stream to the
   live socket **and** `ScrollbackStore.append`.
5. Frontend: modal closes; the list refetches (new running session appears, pinned);
   selection set to it; live terminal mounts in the detail pane.
6. On exit: `sessions.close(exitCode)` + `scrollback.close(id)`; the row moves to Recent with
   its exit badge.
7. Click an **ended** session → `getSessionScrollback(id)` → read-only
   `TerminalPane mode="replay"` shows the output + exit banner.

## 10. Testing strategy (TDD — RED → GREEN → REFACTOR)

- **types/config**: schema + `v2ToV3` migration round-trip; `defaultConfig` shape.
- **sessions**: idempotent column-add on a pre-existing column-less DB; `create`/`query`
  with `name`/`cwd` and `running`/`limit`/`offset`.
- **pty**: `createFileScrollbackStore` (append / rotate-bound / read-concat / close;
  path-traversal rejection) against a temp dir + in-memory fake; manager taps scrollback and
  threads `cwd`/`name`; replay path.
- **ipc**: new method schemas validate; client/server round-trip on the in-memory transport
  pair for profiles / `pickFolder` / scrollback / extended launch.
- **ui**: `SessionList` grouping/pagination; `NewSessionModal` prefill + save-as-profile;
  `Modal` accessibility; `TerminalPane` replay mode (headless `XtermInstance`).
- **desktop**: handlers wire `AppContext`; `pickFolder` handler with the Electrobun seam
  mocked (real behind lazy import).
- **Gate every task**: `bun run typecheck && bun run lint && bun test`. Live xterm round-trip
  and the native folder dialog are the eyes-on items added to
  `apps/desktop/MANUAL-VERIFICATION.md`; `apps/desktop/scripts/smoke.sh` continues to guard
  the build-vs-runs gap.

## 11. Build-plan integration

This is a feature on top of a completed build plan, so:

- This spec lives in `docs/superpowers/specs/`.
- An implementation plan will be written to `docs/superpowers/plans/` (via the writing-plans
  skill).
- A new section in `build-plan/PROGRESS.md` will track these tasks with commit SHAs.
- Package boundaries respected (`@launchkit/<pkg>` imports only; no deep imports/cycles).
  Change order flows: `types` → {`config`, `sessions`, `pty`, `ipc`} → `ui` → `apps/desktop`.
- Project skills inform the work: the provider/harness CRUD patterns guide Profiles CRUD;
  `launchkit-atomic-component` for new UI atoms/molecules/organisms.

## 12. Risks & mitigations

- **Native dialog in tests / headless runs**: keep `pickFolder` behind a lazy import like the
  existing window/tray seams; unit-test the handler with the seam mocked.
- **Scrollback disk growth**: per-session 2-file rotation bounds each session to
  `< 2·capBytes`; a global retention sweep is a noted follow-up.
- **Existing sessions DB upgrade**: idempotent `PRAGMA`-guarded `ALTER TABLE` so existing
  installs migrate in place without data loss.
- **Large UI refactor (`app.tsx`)**: stage behind the new `View` model and section renderers;
  keep `TerminalPane` (the riskiest piece) backward-compatible by adding a `mode` prop rather
  than rewriting it.
