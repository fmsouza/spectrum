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
