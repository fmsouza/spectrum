# Embedded Harness Terminal — Design

**Status:** approved (design), pending spec review → implementation plan
**Date:** 2026-06-02
**Branch:** `remediation/runtime-fixes` (or a follow-on feature branch)

## Problem

Clicking **Launch** in the GUI (Dashboard quick-launch or the tray) records a session but no
harness window ever appears, so the user cannot interact with the launched agent. Root cause: the
GUI and CLI share one launcher that spawns with `stdio: "inherit"`. That is correct for the CLI (it
has the user's terminal) but the GUI process has **no controlling terminal**, so an interactive TUI
harness (Claude Code, Codex, …) starts headless with nowhere to render.

The user chose an **embedded terminal**: render the harness inside the LaunchKit window using a
real PTY on the bun side and `xterm.js` in the webview, with **tabbed, multiple concurrent**
sessions.

## Feasibility (de-risked with working spikes, 2026-06-02)

1. **PTY with zero native dependencies — CONFIRMED.** A `bun:ffi` spike `dlopen`ed `libutil.dylib`,
   called `openpty()` (rc 0, master/slave fds), then `Bun.spawn(cmd, { stdio: [slave, slave, slave] })`.
   The child reported `/dev/ttys000` and `IS_TTY=0` — a **real TTY** (TUIs will render). Output was
   read off the master fd via FFI `read()`. No `node-pty`, nothing fragile to bundle into the
   Electrobun app or `bun build --compile`.
2. **Bidirectional streaming transport — CONFIRMED.** Electrobun exposes a `messages` channel
   (fire-and-forget, both directions) layered on the localhost WebSocket that the webview already
   opens (and that the CSP fix `connect-src … ws://localhost:*` already permits). The app currently
   uses only the request/response (`requests`) side; `messages` is unused and available for the pty
   byte stream.

## Goals / Non-goals

**Goals**
- GUI **Launch** opens the harness in an embedded, interactive terminal the user can type into.
- Multiple concurrent harness terminals, shown as **tabs**; switching between them is instant.
- Terminals survive in-app navigation (the pty lives in bun; re-attach replays scrollback).
- On harness exit, the corresponding `Session` row is closed with its exit code (no stale "running").

**Non-goals (YAGNI for v1)**
- No detach/re-attach of a tab to an external terminal.
- No persistence of terminals across an app restart (ptys die with the app).
- No Windows/Linux support (macOS only — matches the rest of the app).
- No terminal search/serialization addons beyond fit/resize.
- CLI `launch` behavior is unchanged (current-terminal, foreground — already fixed separately).

## Architecture

A new internal package **`@launchkit/pty`** plus webview UI in `apps/desktop/views/main`, wired by
the composition root. Boundaries follow the project conventions: pure logic + injected effect
adapters, `Result<T,E>` over throwing, no `any`.

```
GUI Launch (Dashboard/tray)
   → IPC launchHarness handler  (apps/desktop)
   → TerminalManager.launch()   (@launchkit/pty, injected into AppContext)
        ├─ PtyAdapter.open()     (bun:ffi openpty + Bun.spawn on the slave fd)
        ├─ registry: id → { status, scrollback ring buffer }
        ├─ pty.onData → append scrollback + push `pty-data` message → webview
        ├─ pty.onExit → mark registry exited + SessionStore.close(code) + `pty-exit`
        └─ returns { sessionId }
   → webview opens a Terminal tab for sessionId, xterm attaches

Webview Terminal tab (xterm.js)
   → on attach: send `pty-attach {id}`  → bun replays scrollback → live `pty-data`
   → keystrokes: `pty-input {id,data}`  → bun → pty.write
   → resize (fit addon): `pty-resize {id,cols,rows}` → bun → pty.resize (ioctl TIOCSWINSZ)
   → close tab: `pty-kill {id}` → bun → pty.kill → exit flow
```

### Package `@launchkit/pty`

Pure + unit-tested (fake pty):
- **`TerminalRegistry`** — `Map<SessionId, TerminalState>` where `TerminalState = { status: "running"|"exited", exitCode: number|null, scrollback: RingBuffer }`. A bounded ring buffer (default ~5,000 lines / a byte cap) so reattach and memory stay bounded. Pure operations: `create`, `appendData`, `markExited`, `snapshot`, `remove`.
- **Message protocol codec** — zod schemas + encode/decode for the `messages` payloads (below). Pure, fully tested.
- **`createTerminalManager(deps)`** — orchestrates: `launch(params) → Result<{sessionId}, …>`, `input(id, data)`, `resize(id, cols, rows)`, `kill(id)`, `attach(id) → scrollback snapshot`. Takes injected `PtyAdapter`, a `send(message)` sink (to the webview), a `Clock`/`IdGen`, and a `SessionSink` (subset of `SessionStore`: `close(id, exitCode)`), plus the harness launch inputs (resolved command + env). All decisions live here; tested with a fake pty + recording send sink.

Effect adapter (integration-tested, not unit-tested):
- **`PtyAdapter`** interface: `open(opts: { command, args, env, cols, rows }) → Result<PtyHandle, PtyError>` where `PtyHandle = { write(data: Uint8Array): void; resize(cols, rows): void; onData(cb): void; onExit(cb: (code: number) => void): void; kill(): void }`.
- **`createFfiPty()`** — real impl: `bun:ffi` `openpty` (libutil) → fds; `Bun.spawn([command, ...args], { stdio: [slave, slave, slave], env })`; non-blocking drain of the master fd (set `O_NONBLOCK`, pump via a stream/interval) → `onData`; `child.exited` → close fds + `onExit`; `resize` via `ioctl(master, TIOCSWINSZ, winsize)`; `write` via FFI `write(master, …)`; `kill` via `child.kill()`. macOS-specific; failures (e.g. openpty rc≠0) return `err`.
- **`createFakePty()`** — scriptable for tests (emit data, trigger exit, record writes/resizes).

### Bun-side wiring (apps/desktop)

- `AppContext` gains a `terminal: TerminalManager` built in `composition.ts` from `createFfiPty()`,
  the real `SessionStore.close`, clock/idgen, and a `send` sink that pushes Electrobun `messages` to
  the webview.
- The **GUI** `launchHarness` IPC handler (and the tray Launch click) call `ctx.terminal.launch(...)`
  instead of the headless `ctx.launch(...)`. They resolve the command + env exactly as today (proxy
  vars merged), but hand them to the pty manager. Returns `{ sessionId }`.
- The **CLI** path (`cliDepsFrom`) keeps using the inherit-stdio foreground launcher — unchanged.
- `window.ts` registers a `messages` handler on the Electrobun RPC that routes inbound
  `pty-input/resize/attach/kill` to `ctx.terminal`, and provides the `send` sink for outbound
  `pty-data/pty-exit`.

### Transport protocol (zod-validated)

bun → webview:
- `{ type: "pty-data", id: SessionId, data: string }` (base64 of the raw pty bytes)
- `{ type: "pty-exit", id: SessionId, code: number }`

webview → bun:
- `{ type: "pty-input", id, data }` (base64 keystrokes)
- `{ type: "pty-resize", id, cols, rows }`
- `{ type: "pty-attach", id }` (bun replies by replaying scrollback as `pty-data`, then live)
- `{ type: "pty-kill", id }`

Data is base64 so arbitrary bytes survive JSON. All payloads are zod-parsed on receipt on both ends.

### Webview UI (apps/desktop/views/main)

- New **`terminal`** route + nav item. The page renders a **tab strip** (one tab per session in the
  webview's terminal store, label = harness id, with an exit/closed indicator) and an active
  `xterm.js` pane.
- New local deps: `@xterm/xterm` + `@xterm/addon-fit` (bundled by the Electrobun view build; CSP
  allows `style-src 'self' 'unsafe-inline'` for xterm's CSS — bundle/import it locally, no remote).
- A `useTerminals()` hook holds the per-session xterm instances + the message wiring, so terminals
  keep their state across route changes (instances are created once and reused; the pane mounts the
  active one). On first attach for a session it sends `pty-attach` and writes incoming `pty-data` to
  the xterm; on xterm `onData` it sends `pty-input`; the fit addon's resize → `pty-resize`.
- Launch flow: `launchHarness` IPC now returns `{ sessionId }`; the caller registers the session in
  the terminal store and navigates to the `terminal` route focused on the new tab. The tray Launch
  opens the window and does the same.

## Error handling

- `PtyAdapter.open` failure (openpty rc≠0, spawn fail) → `launch` returns `err`; the GUI shows the
  failure in a new tab (or a toast), never a silent no-op.
- Malformed inbound message → zod parse fails → dropped + logged (no throw across the boundary).
- Harness exit (any code) → registry `markExited`, `SessionStore.close(id, code)`, `pty-exit` to the
  webview; the tab shows "exited (code N)" and can be closed.
- Webview reload → ptys keep running in bun; on re-mount the webview re-attaches each known session
  via `pty-attach` (scrollback replay). (Discovery of existing sessions after a full reload can reuse
  the existing `getSessions` IPC filtered to `running`; v1 may simply repopulate tabs from that.)

## Testing strategy

- **Unit (TDD, fake pty):** `TerminalRegistry` (create/append/markExited/snapshot/ring-buffer cap),
  protocol codec (encode/decode/round-trip/reject-malformed), `createTerminalManager`
  (launch wires pty→send; input/resize forwarded; exit closes the SessionStore with the code; attach
  replays scrollback; kill terminates). Recording `send` sink + fake `SessionSink`.
- **Integration (real FFI, macOS):** `createFfiPty` spawns a TTY-reporting command, asserts the child
  sees a TTY, streamed output arrives via `onData`, `resize` succeeds, and `onExit` fires with the
  code. Extends the proven spike.
- **Webview:** the dumb xterm render is thin; the message plumbing is covered at the protocol/manager
  layer. A light hook test (fake transport) covers attach/input/resize message emission.
- **Gate:** `bun run typecheck && bun run lint && bun test` green; `bunx electrobun build` succeeds
  and bundles xterm; manual eyes-on: Launch → type into the agent → resize → exit closes the session.

## Decisions (defaults chosen, approved)

- Tabbed, multiple concurrent sessions.
- Close-tab kills the harness and closes the session.
- Scrollback buffer ~5,000 lines (bounded), replayed on attach; survives in-app navigation.
- Tray Launch opens the window to the new tab.
- PTY allocation failure surfaces as a visible error tab, never a silent no-op.
- GUI uses the pty manager; CLI keeps the inherit-stdio foreground launcher (no CLI change).

## Affected code (high level)

- New: `packages/pty/**` (`@launchkit/pty`): registry, protocol, manager, ffi adapter, fakes, tests.
- `apps/desktop/src/composition.ts` — build + expose `terminal` on `AppContext`; provide the webview
  `send` sink.
- `apps/desktop/src/gui/ipc/handlers.ts` + `gui/tray.ts` — GUI launch calls `ctx.terminal.launch`.
- `apps/desktop/src/gui/window.ts` — register the Electrobun `messages` handler + outbound sink.
- `apps/desktop/views/main/**` — `terminal` route, tab strip, xterm pane, `useTerminals` hook,
  message client; nav item in `app.tsx`; `package.json` adds `@xterm/xterm` + `@xterm/addon-fit`.
- `packages/ipc` is NOT required for the stream (it rides Electrobun `messages`), but the
  `launchHarness` result may extend to include `sessionId` if not already present.
