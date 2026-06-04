# LaunchKit — Manual Verification Checklist (built desktop app)

Run after `bunx electrobun build` in `apps/desktop`. These steps cover what `bun test` cannot:
the native window, the native tray, and click-through behavior. Check each box on a real macOS run.

## Build & launch
- [ ] `bunx electrobun build` completes with no errors.
- [ ] Launching the built binary with **no args** opens the GUI window titled "LaunchKit".
- [ ] A **tray icon** appears in the macOS menu bar.

## Tray menu (tray-and-polish)
- [ ] The tray's **first item** is a status row: green dot + "Proxy: on" while the GUI is open
      (the persistent proxy is running); it reads grey + "Proxy: off" if the proxy is stopped.
- [ ] The **Launch** submenu lists one item per configured harness (built-ins: Claude Code, Codex,
      opencode, openclaw), or "No harnesses configured" when none exist.
- [ ] Clicking a **Launch** item spawns that harness (terminal/child process appears) using its
      default alias, and a new row appears in the **Sessions** page.
- [ ] **Open LaunchKit** focuses/opens the main window.
- [ ] **Quit** exits the app (window + tray disappear).

## Sessions master/detail + embedded terminal (session redesign)
- [ ] **New session** (the session-list "+ New session" button) opens a modal; submitting it launches
      the chosen harness and the Claude Code TUI renders **interactive** in the detail pane — you can
      type and see the agent respond (routed through the loopback proxy, so a provider + the matching
      alias must be configured first), and the new session is **selected** in the list.
- [ ] **Click New session → the native folder picker opens for cwd**, the modal launches the chosen
      harness, and the new live terminal appears selected. If **"save as profile"** is checked, the new
      profile shows under **Settings → Profiles**.
- [ ] Resizing the window reflows the selected terminal (the TUI uses the new width/height).
- [ ] **Launch two harnesses, switch between them in the session list**, confirm each keeps its live
      output (scrollback survives selection), and **typing reaches only the selected** live session.
- [ ] Switching to **Settings** and back to **Sessions** keeps every running session live and its
      scrollback intact (live panes stay mounted, just hidden).
- [ ] Selecting an **ended** session shows its captured output **read-only** (replay), with no input.
- [ ] The tray **Launch** also opens the window with the new session selected and its terminal live.

## CLI mode
- [ ] `launchkit list harnesses` prints the built-in harness ids (no window opens).
- [ ] `launchkit list providers` prints provider ids/names and **never** prints a secret value or ref.
- [ ] With the GUI open, a CLI `launch` reuses the running proxy (no second proxy starts).

## Provider connectivity test (tray-and-polish)
- [ ] In the Providers page, "Test" on a correctly-configured provider reports **ok** with a latency.
- [ ] "Test" on a provider with a missing/invalid key reports **not ok** (no secret value shown).

## Config import/export (tray-and-polish)
- [ ] Export produces a JSON file containing provider config + keychain **refs** but **no secret values**.
- [ ] Importing that file restores providers/aliases; importing a foreign/invalid file is rejected
      with a clear message (and does not corrupt the existing config).

## Security spot-checks
- [ ] The proxy is bound to `127.0.0.1` only (e.g. `lsof -iTCP -sTCP:LISTEN -P | grep launchkit`
      shows loopback, never `*` / `0.0.0.0`).
- [ ] No secret value appears in any log line, the exported config, or the webview dev tools.
