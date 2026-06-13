# @spectrum/platform

**Responsibility:** The single source of OS-specific decisions — platform detection, idiomatic per-OS application paths, absolute-path testing, default termination signal, and the legacy-macOS-dir migration plan. Pure; zero IO.

**Public API (barrel `src/index.ts`):** `Platform`; `detectPlatform()`; `AppPaths`/`ResolveAppPathsInput`/`resolveAppPaths()`; `isAbsolutePath()`; `defaultTerminationSignal()`; `LegacyMacosMigration`/`planLegacyMacosMigration()`/`legacyMacosConfigDir()`.

**Depends on:** none (pure TypeScript; only `node:path` types).

**Effects owned:** none — every function is pure and takes `platform`/`homeDir`/`env` as input.

**Local rules:** never read `process.platform`/`process.env`/`os.homedir()` inside a function — they are inputs. `detectPlatform()` is the ONLY place that may default to `process.platform`. Path joins use `node:path` `win32`/`posix` variants chosen by the `platform` arg so results are deterministic on any host.
