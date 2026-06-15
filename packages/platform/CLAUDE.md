# @spectrum/platform

**Responsibility:** The single source of OS-specific decisions — platform detection, idiomatic per-OS application paths, absolute-path testing, default termination signal, and the legacy-macOS-dir migration plan. Pure; zero IO.

**Public API (barrel `src/index.ts`):** `Platform`; `detectPlatform()`; `SpectrumEnv`/`detectAppEnv()`; `AppPaths`/`ResolveAppPathsInput`/`resolveAppPaths()`; `isAbsolutePath()`; `defaultTerminationSignal()`; `LegacyMacosMigration`/`planLegacyMacosMigration()`/`legacyMacosConfigDir()`.

**Dev/prod data isolation:** `detectAppEnv(env)` returns `"development"` only when `env.SPECTRUM_ENV === "development"`, else `"production"` (the safe default). `resolveAppPaths` takes an optional `appEnv` that selects a separate directory in development — `Spectrum (Dev)` (macOS/Windows) / `spectrum-dev` (Linux/XDG) — so dev runs never collide with production data. Omitting `appEnv` yields the production dir; `SPECTRUM_DATA_DIR` still overrides both.

**Depends on:** none (pure TypeScript; only `node:path` types).

**Effects owned:** none — every function is pure and takes `platform`/`homeDir`/`env` as input.

**Local rules:** never read `process.platform`/`process.env`/`os.homedir()` inside a function — they are inputs. `detectPlatform()` is the ONLY place that may default to `process.platform`. Path joins use `node:path` `win32`/`posix` variants chosen by the `platform` arg so results are deterministic on any host.
