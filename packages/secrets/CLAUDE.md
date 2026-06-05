# @launchkit/secrets

**Responsibility:** Keychain-backed secret storage so `config.json` stores only `SecretRef`s, never raw API keys.

**Public API (barrel `src/index.ts`):** `SecretStore` + `createSecretStore({ backend, idGen })`; `KeychainBackend` + `createInMemoryKeychainBackend()` (test fake) + `createMacosSecurityBackend({ runner })`; `ProcessRunner` + `createBunProcessRunner()`; `SecretError`.

**Depends on:** `@launchkit/types` (`SecretRef`), `@launchkit/utils` (`Result`, `redactSecrets`, `IdGen`)md.

**Effects owned:** keychain (via the `KeychainBackend` interface) + process spawn (via the `ProcessRunner` interface) — exposed to consumers as injected interfaces; never reached around.

**Local rules:** expose the `SecretStore` interface + real macOS adapter + in-memory fake. Secrets are NEVER logged, embedded in an error `detail`, or returned to the webview — run any CLI output through `redactSecrets` first. Spawn the `security` CLI with argument arrays only (never a shell string). The keychain service name is always `"launchkit"`. `set` mints a ref via `idGen.next("kc")`.
