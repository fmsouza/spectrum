# Spectrum — Manual Verification Checklist (built desktop app)

Run after `bunx electrobun build` in `apps/desktop`. These steps cover what `bun test` cannot:
the native window, the native tray, and click-through behavior. Check each box on a real macOS run.

## Build & launch
- [ ] `bunx electrobun build` completes with no errors.
- [ ] Launching the built binary with **no args** opens the GUI window titled "Spectrum".
- [ ] A **tray icon** appears in the macOS menu bar.

## Tray menu (tray-and-polish)
- [ ] The tray's **first item** is a status row: green dot + "Proxy: on" while the GUI is open
      (the persistent proxy is running); it reads grey + "Proxy: off" if the proxy is stopped.
- [ ] The **Launch** submenu lists one item per configured harness (built-ins: Claude Code, Codex,
      opencode, openclaw), or "No harnesses configured" when none exist.
- [ ] Clicking a **Launch** item spawns that harness (terminal/child process appears) using its
      default alias, and a new row appears in the **Sessions** page.
- [ ] **Open Spectrum** focuses/opens the main window.
- [ ] **Quit** exits the app (window + tray disappear).

## Sessions master/detail + embedded terminal (session redesign)
- [ ] **New session** (the session-list "+ New session" button) opens a modal; submitting it launches
      the chosen harness and the Claude Code TUI renders **interactive** in the detail pane — you can
      type and see the agent respond (routed through the loopback proxy, so a provider + the matching
      alias must be configured first), and the new session is **selected** in the list.
- [ ] **Click New session → the native folder picker opens for cwd**, the modal launches the chosen
      harness, and the new live terminal appears selected.
- [ ] **Folder is remembered:** launch a session with a chosen cwd, then reopen **New session** —
      the Folder field is **prefilled** with that last-launched path (persisted in settings).
- [ ] Resizing the window reflows the selected terminal (the TUI uses the new width/height).
- [ ] **Launch two harnesses, switch between them in the session list**, confirm each keeps its live
      output (scrollback survives selection), and **typing reaches only the selected** live session.
- [ ] Switching to **Settings** and back to **Sessions** keeps every running session live and its
      scrollback intact (live panes stay mounted, just hidden).
- [ ] Selecting an **ended** session shows its captured output **read-only** (replay), with no input.
- [ ] The tray **Launch** also opens the window with the new session selected and its terminal live.

## CLI mode
- [ ] `spectrum list harnesses` prints the built-in harness ids (no window opens).
- [ ] `spectrum list providers` prints provider ids/names and **never** prints a secret value or ref.
- [ ] With the GUI open, a CLI `launch` reuses the running proxy (no second proxy starts).

## Provider connectivity test (tray-and-polish)
- [ ] In the Providers page, "Test" on a correctly-configured provider reports **ok** with a latency.
- [ ] "Test" on a provider with a missing/invalid key reports **not ok** (no secret value shown).

## Config import/export (tray-and-polish)
- [ ] Export produces a JSON file containing provider config + keychain **refs** but **no secret values**.
- [ ] Importing that file restores providers/aliases; importing a foreign/invalid file is rejected
      with a clear message (and does not corrupt the existing config).

## Layout & responsiveness (UI spacing re-architecture — Bugs 1–9)

Build and launch with `apps/desktop/scripts/smoke.sh`. Inspect geometry with WebKit devtools
(`Cmd+Option+I` in the running app). Check each item below.

- [ ] **Bug 1 — Settings sidebar: single border.**
      Navigate to Settings. The sidebar (master column) has exactly one right-side border between
      it and the detail pane. No doubled inset, no missing gap, no double `<nav>` wrapper in the DOM
      (`Cmd+Option+I` → Elements: the Settings nav must be a bare `<ul class="lk-settings-nav">`,
      not wrapped in a `<nav aria-label="Settings">`).

- [ ] **Bug 2 — Session rows: dot · name (ellipsized) · badge layout.**
      Open a session with a long name (e.g. rename via the session title). In the Sessions master,
      the row shows: 10 px status dot → name (truncates with `…` when long) → badge ("running",
      "ended", or "exit N") at its intrinsic width on the right. The dot and badge must not shrink
      or overflow.

- [ ] **Bug 3 — Window resize: fluid master column.**
      Drag the window from ~700 px wide to full width (and back). The master (Sessions/Settings list)
      column is fluid — it widens smoothly between its clamp bounds (~232–320 px). The detail/terminal
      column grows to fill remaining space. No dead band where the master hogs the whole width.

- [ ] **Bug 4 — Terminal resize: no main scrollbar, no clipped rows.**
      With a live session open, drag the window narrower and wider. The terminal fits the pane at
      every size (xterm's FitAddon refits). The `<main>` element has no vertical scrollbar; the
      terminal surface reaches every edge of the detail pane (`main:has(> .lk-sessions-detail)`
      gets `padding:0; overflow:hidden`).

- [ ] **Bug 5 — Replay pane: banner + pane fit without clipping.**
      Select an ended session that has captured output. The exit banner (`exited · code N · ended …`)
      renders as a thin strip above the read-only replay terminal. The replay terminal fills the
      remaining vertical space; nothing is clipped or overflows.

- [ ] **Bug 6 — New-session modal (narrow): Browse stays on-row.**
      Narrow the window to ~700 px, then open "New session". The "Browse…" button stays on the same
      row as the Folder text input. The input shrinks; the button never wraps below or overflows the
      modal edge (`Cmd+Option+I` → check `.lk-folder-field` is a flex row with the input shrinking).

- [ ] **Bug 7 — Models table (narrow): Edit/Delete wrap instead of clipping.**
      With at least one model configured, open Settings → Models. Narrow the window. The Edit and
      Delete buttons in the actions column wrap to a second line rather than clipping or overflowing
      the table cell (`.lk-cell-actions` uses `flex-wrap: wrap`).

- [ ] **Bug 8 — Form Save/Cancel: tidy row at all widths.**
      Open any settings form (e.g. Settings → Harnesses → "Add custom harness", or
      Settings → Models → "Add model"). The Save and Cancel buttons are on a single row
      (`<div class="lk-row lk-form-actions">`), left-aligned, at all window widths.
      They must not be stacked vertically or separated by excess margin.

- [ ] **Bug 9 — Hidden→visible terminal refits after resize.**
      Launch two sessions. Select session A and resize the window while session B is hidden.
      Switch to session B. If it renders at a stale size (wrong column count / bottom rows clipped),
      that is a refit regression. Expected behavior: `ResizeObserver` on `lk-terminal-pane-host`
      catches the show transition and xterm refits automatically. Mark this item "no-repro" if
      the refit happens correctly without additional code.

*Reference:* build and launch via `apps/desktop/scripts/smoke.sh`; inspect the live DOM with
WebKit devtools (`Cmd+Option+I`); see `selector-contract.test.tsx` for the automated CSS↔markup
regression guard.

## Security spot-checks
- [ ] The proxy is bound to `127.0.0.1` only (e.g. `lsof -iTCP -sTCP:LISTEN -P | grep spectrum`
      shows loopback, never `*` / `0.0.0.0`).
- [ ] No secret value appears in any log line, the exported config, or the webview dev tools.
