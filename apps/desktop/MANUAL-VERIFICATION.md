# Manual Verification — Cross-Platform GUI

> For the macOS-specific UI regression checklist (Bugs 1-9 layout/responsiveness, Security spot-checks), see [`MANUAL-VERIFICATION.macos.md`](./MANUAL-VERIFICATION.macos.md).

Run on each OS after a release build. CI verifies the launch + proxy smoke; this checklist verifies
the human-facing surface that CI cannot.

## All platforms
- [ ] App window opens and the React UI renders (rail + master + detail shell).
- [ ] System tray icon appears; the tray menu opens; a tray "Launch" starts a session.
- [ ] Add a provider API key in Settings, then restart the app — the key is still there.
- [ ] Launch a harness (claude/codex/opencode) — it routes through the proxy with the stored key.

## macOS
- [ ] Key is stored in the **Keychain** (`security find-generic-password -s spectrum`).
- [ ] First launch after upgrade migrated `~/.config/launchkit` → `~/Library/Application Support/Spectrum` (old dir has a `.migrated-to-app-support` marker; data intact).

## Linux
- [ ] Window renders via **CEF**; no missing-GTK errors.
- [ ] With a desktop keyring: key is stored via **Secret Service** (`secret-tool lookup service spectrum account <ref>`).
- [ ] Headless (no keyring) with `SPECTRUM_SECRET_PASSPHRASE` set: key add/find works (encrypted file under `~/.config/spectrum/secrets/`).
- [ ] Headless with NO passphrase and NO keyring: adding a key fails with a clear "set a passphrase / install a keyring" message (never silent plaintext).

## Windows
- [ ] App launches; window renders. (Debug with `ELECTROBUN_CONSOLE=1` if needed.)
- [ ] Key stored as a **DPAPI-encrypted file** under `%APPDATA%\Spectrum\secrets\`; survives restart.
- [ ] Data lives under `%APPDATA%\Spectrum` (config.json, spectrum.db, harnesses).

---

## Update-notification flow (in-app auto-update)

This section covers the update banner, download, and restart flow introduced in the
in-app-auto-update feature. A full `electrobun build` cannot run in this dev
environment, so this is a manual checklist.

### Prerequisites

Build a real app bundle and install it (or use an already-installed copy).
The bundle's `Contents/Resources/version.json` (macOS) or `Resources/version.json`
(Linux/Windows) controls what the updater reads.

### Step 1 — Simulate a newer version available

1. Locate the installed bundle's `version.json`:
   - **macOS:** `<AppBundle>.app/Contents/Resources/version.json`
   - **Linux:** `<bundle-dir>/Resources/version.json`
   - **Windows:** `<bundle-dir>\Resources\version.json`
2. Note the current `hash` and `version` values.
3. Point `baseUrl` at a local HTTP server (or leave the real URL if a release exists)
   that serves a `<channel>-<os>-<arch>-update.json` with a different `hash`.
   Example minimal `stable-macos-arm64-update.json`:
   ```json
   { "version": "99.0.0", "hash": "fakehash99" }
   ```
4. Update `version.json`'s `baseUrl` field to point at your test server, or ensure
   the real rolling-tag `updates` release has a newer hash than the installed build.

### Step 2 — Launch the app and observe the banner

- [ ] App opens without blocking; the update check runs in the background (non-blocking).
- [ ] Within a few seconds a dismissible banner appears: _"Spectrum 99.0.0 is available."_
      with **Download** and **Dismiss** buttons.
- [ ] Dismissing the banner hides it; it does not reappear on this launch for the same version.
- [ ] Settings → General → Updates shows the current version, the available version,
      a Stable/Canary channel toggle, and a "Check for updates" button.

### Step 3 — Download

- [ ] Clicking **Download** starts the background download. The banner changes to show
      progress (or a spinner).
- [ ] The app remains fully usable during download (routing, chat, settings all work).
- [ ] When download is complete the banner changes to _"Update ready — Restart now"_.

### Step 4 — Apply / Restart

- [ ] Clicking **Restart now** closes the app and reopens it on the new version.
- [ ] If **Restart now** is not clicked, quitting and reopening the app naturally
      applies the staged update and launches the new version.

### Step 5 — Channel toggle

- [ ] Switching the channel toggle from Stable to Canary in Settings persists the
      choice (config `updateChannel = "canary"`).
- [ ] Clicking "Check for updates" after the switch fetches `canary-<os>-<arch>-update.json`
      instead of `stable-…` (confirm in Bun process logs or network inspector).
- [ ] Switching back to Stable reverts to the `stable-…` feed on the next check.

### Notes

- The update notification runs in **GUI mode only**; the CLI binary is not self-updated.
- The `dev` channel (local dev builds) disables updates automatically — the banner
  will never appear in dev mode.
- If `baseUrl` is empty or the fetch times out, the check silently collapses to
  "up-to-date" with no error surface to the user.
