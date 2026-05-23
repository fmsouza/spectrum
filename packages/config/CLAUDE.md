# @launchkit/config

**Responsibility:** Read/write `~/.config/launchkit/config.json` — factory defaults, versioned forward migrations, and atomic, `0600` persistence. Secrets are never stored here (a `Provider` models them as `SecretRef`).

**Public API (barrel `src/index.ts`):** `Config`/`ConfigSchema`, `Settings`/`SettingsSchema`, `CURRENT_CONFIG_VERSION`, `defaultConfig()`; `Migration`/`migrations`/`runMigrations`; `ConfigError`; `ConfigFile`/`createInMemoryConfigFile()` (test fake)/`createFsConfigFile()` (real adapter); `ConfigStore`/`createFileConfigStore({ file })`/`createCachedConfigStore(inner)`.

**Depends on:** `@launchkit/types` (`Provider`, `ModelAlias`, `SecretRef`), `@launchkit/utils` (`Result`, `ok`, `err`, `isOk`, `Clock`) — see build-plan/02-monorepo/boundaries.md.

**Effects owned:** config file (via the injected `ConfigFile` interface) — exposed to consumers as an injected interface; never reached around.

**Local rules:** atomic writes (`<file>.tmp` → fsync → rename), `chmod 0600` on the file / `0700` on the dir, zod-validate on load AND after migration, versioned forward migrations only. Secrets are references only — a provider with an inline raw secret string MUST fail `ConfigSchema`. `proxyHost` is the literal `127.0.0.1` (loopback only). The cached store is the read path; disk is read once.
