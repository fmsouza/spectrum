# @launchkit/secrets

**Responsibility:** Keychain-backed secret storage so `config.json` stores only `SecretRef`s, never raw API keys. Cross-platform: macOS Keychain, Linux Secret Service (libsecret), Windows DPAPI-encrypted file.

**Public API (barrel `src/index.ts`):** `SecretStore` + `createSecretStore({ backend, idGen })`; `KeychainBackend` + `createInMemoryKeychainBackend()` (test fake) + `createMacosSecurityBackend({ runner })` + `createSecretToolBackend({ runner })` + `createEncryptedFileBackend({ fileOps, secretsDir, cipher })`; `SecretCipher` + `createPassphraseAeadCipher({ getPassphrase })` + `createDpapiCipher({ runner })`; `SecretFileOps` + `createFsSecretFileOps(platform?)` + `createInMemorySecretFileOps()` (test fake); `ProcessRunner` + `createBunProcessRunner()`; `createPlatformKeychainBackend({ platform, runner, fileOps, secretsDir, secretPassphrase, commandExists? })`; `isSecretServiceAvailable({ runner, commandExists? })`; `SecretError`.

**Depends on:** `@launchkit/types` (`SecretRef`), `@launchkit/utils` (`Result`, `redactSecrets`, `IdGen`), `@launchkit/platform` (`Platform`).

**Effects owned:** keychain (via the `KeychainBackend` interface) + process spawn (via the `ProcessRunner` interface) + filesystem (via the `SecretFileOps` interface) — exposed to consumers as injected interfaces; never reached around.

**Local rules:** macOS → `security`; Linux → `secret-tool` (libsecret) with a passphrase-encrypted-file fallback when no Secret Service; Windows → DPAPI-encrypted file via PowerShell. The keychain service name is always `"launchkit"`. Secrets are NEVER logged, embedded in an error `detail`, or returned to the webview — run any CLI output through `redactSecrets` first. Secrets are passed on stdin (secret-tool/PowerShell) or arg arrays (security) — never a shell string; encrypted-file backends never persist plaintext. `set` mints a ref via `idGen.next("kc")`.
