# @spectrum/harnesses

**Responsibility:** Registry (builtins + user JSON) + launcher.

**Public API (barrel `src/index.ts`):** `ALLOWED_TOKENS`, `validateEnvTemplate`, `claude`/`codex`/`opencode`/`openclaw`, `builtinHarnesses`, `createInMemoryHarnessFileSource`, `createFakeCommandResolver`, `createRecordingProcessSpawner`, `createRegistry`, `launchHarness`, `createPathCommandResolver`, `createBunProcessSpawner`, `createDirHarnessFileSource`. Type-only: `HarnessError`, `HarnessFileSource`, `CommandResolver`, `ProcessSpawner`, `SpawnCall`, `RecordingProcessSpawner`, `HarnessRegistry`, `LaunchParams`, `LaunchRoute`, `AllowedToken`.

**Depends on:** `@spectrum/types`, `@spectrum/utils`, `@spectrum/platform`, `@spectrum/logger`

**Effects owned:** process spawn + reading harness JSON.
— exposed to consumers as injected interfaces; never reached around.

`launchHarness` accepts an injected `Logger` (default noop); logs `error` on spawn/launch failure (`{ kind, detail }`; never the rendered proxy env / per-run key).

**Local rules:** spawn with arg arrays; validate command + template tokens; registry hot-reloads from disk.
