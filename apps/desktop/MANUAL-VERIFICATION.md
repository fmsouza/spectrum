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
