# Convention — Security ("optimal")

Security is a first-class requirement and **overrides** the architecture doc's "store API keys as-is for now." Every plan that touches an item below must implement it; reviewers reject work that doesn't.

## Secrets

- **API keys / credentials live in the OS keychain** (macOS Keychain), accessed only through `@launchkit/secrets`.
- `config.json` stores a **keychain reference id**, never a secret value. A `Provider.config` field that is a secret holds `{ ref: "<keychain-id>" }`, not the raw key.
- Secrets are fetched on demand at request time in the main process. **Secrets never cross IPC to the webview** — the GUI shows masked placeholders and "set/replace" actions only.
- A redaction helper (`redactSecrets`) scrubs known secret-shaped values from every log line and error message. Test it.

## Network surface

- The proxy binds **`127.0.0.1` only** (loopback). Never `0.0.0.0`, never an external interface. This is asserted in a test.
- A **per-run random proxy key** (`{{proxyKey}}`, ≥32 bytes base64url) is generated at proxy start. Every inbound request must present it (`Authorization`/`x-api-key`); requests without it are rejected `401`. Defense-in-depth even on loopback (guards against other local users/processes).
- CORS: the proxy does not enable permissive CORS. It serves local harnesses, not browsers.

## Input validation

- **Every external input is zod-validated before use**, at the boundary, returning a typed error on failure:
  - proxy request bodies (`/v1/messages`, `/v1/chat/completions`);
  - IPC message payloads (both directions);
  - `config.json` on load (and after migration);
  - user-supplied harness JSON files.
- Reject-by-default: unknown/extra fields are stripped or rejected (`.strict()` where appropriate). Never trust shape from disk or wire.

## Process spawning (harness launcher)

- Spawn with an **argument array**, never a shell string — no `sh -c`, no string interpolation into a command. (`Bun.spawn(["claude", ...args])`.)
- Validate the resolved `command`: it must resolve on `PATH` or be an explicitly configured absolute path. Reject relative paths with `..`.
- `envTemplate` tokens are restricted to the known set (`{{proxyUrl}}`, `{{proxyKey}}`, `{{model}}`); unknown tokens are rejected. Rendered env values are validated (URL is loopback, model is a known alias).

## Filesystem

- **Atomic writes**: write to `<file>.tmp`, `fsync`, then `rename`. Never partial-write `config.json` or the db.
- **Permissions `0600`** on `config.json` and `launchkit.db`; `0700` on `~/.config/launchkit/`.
- Resolve and contain paths; never write outside the config dir based on untrusted input.

## SQLite

- **Parameterized statements only.** No string concatenation/interpolation into SQL. Use bound parameters for every value.

## Webview hardening (Electrobun)

- Strict **Content-Security-Policy**: no remote scripts, `default-src 'self'`; no `unsafe-eval`.
- Navigation is **locked to the app origin**; external links open in the system browser, not the webview.
- The webview gets **no direct filesystem/network/secret access** — only the narrow, validated IPC contract.

## Supply chain

- Commit the lockfile (`bun.lock`). **Pin** `@ai-sdk/*` and `electrobun` versions (no `^` drift on security-sensitive deps).
- Keep the dependency surface minimal; justify each new dep in the task that adds it.
- Run `bun audit` in CI; treat high-severity advisories as blockers.

## Logging

- Never log secrets, full request bodies with secrets, or keychain values. Run user-controlled strings through `redactSecrets` before logging.
- Errors surfaced to the GUI are typed and message-safe (no stack traces with secrets).
