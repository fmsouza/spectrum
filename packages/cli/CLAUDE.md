# @spectrum/cli

**Responsibility:** argv parsing + the `launch` / `list` / `add` / `remove` commands, orchestrating the other packages.

**Public API (barrel `src/index.ts`):** `parseArgs` + `ParsedArgs`; `runCli(deps)(argv)`; the per-command functions `list`, `launchCommand`, `add`, `remove`; the `Writer`/`MemoryWriter` interface + `createMemoryWriter()` (test fake); `CliError`; `CliDeps` + `StartProxyDeps`.

**Depends on:** `@spectrum/types`, `@spectrum/utils`, `@spectrum/config`, `@spectrum/secrets`, `@spectrum/proxy`, `@spectrum/harnesses`, `@spectrum/sessions`, `@spectrum/projects`md.

**Effects owned:** none directly — every effect (config file, keychain, proxy server, process spawn, sqlite) arrives through an injected interface on `CliDeps`. The app shell (`apps/desktop`) constructs the real adapters and injects them.

Accepts an optional injected `Logger` (default noop); `runCli` logs `error` on a failed command (`{ kind }` only — never argv/secrets). The user-facing stderr line is unchanged.

**Local rules:** commands are PURE functions over injected deps; they never import `node:fs`, `Bun.spawn`, the keychain, or open a socket directly. All output goes through the injected `Writer` (never `console.log`), so tests assert on recorded lines. Errors are returned as `Result<void, CliError>` — nothing throws. SECURITY: never print a secret value or keychain ref (`list providers` shows id/name/sdkProvider only); the per-run proxy key from `genProxyKey()` flows into `launch`/`proxy.start` only and is never written to output; `add provider` creates providers with empty `secrets` (the GUI sets secret values via `setProviderSecret`).
