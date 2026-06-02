# CI fix + canary/release pipeline — design

**Date:** 2026-05-25
**Status:** Approved (pending spec review)
**Reference model:** https://github.com/fmsouza/argon (`.github/workflows/ci.yml`, `canary.yml`)

## Problem

Three issues, from the user request:

1. **CI is failing.** The `bun audit` step (last step of `.github/workflows/ci.yml`) exits 1
   on 8 advisories. typecheck, lint, and `bun test` all pass — the audit is the only red.
2. **CI does not build the app.** The pipeline only verifies. We need **canary builds on every
   merge to `main`** and **real semver releases when a `v*` tag is pushed**, following argon's model.
3. **Root `package.json` has no `version`.** It must carry the correct version to act as the
   release source-of-truth.

## Current state (verified 2026-05-25)

- `bun` 1.3.14. `bun audit` supports `--audit-level` and `--ignore=<CVE>`.
- Failing advisories:
  | Package | Severity | Path | Fix |
  |---|---|---|---|
  | happy-dom <20 | critical + 2×high | direct dev dep + `@happy-dom/global-registrator` | bump → `^20` (latest 20.9.0) |
  | turbo ≤2.9.13 | moderate + low | direct dev dep | bump → latest |
  | uuid <11.1.1 | moderate | transitive via `@ai-sdk/google-vertex` | `overrides` → `^11.1.1` |
  | jsondiffpatch <0.7.2 | moderate | transitive via `ai` | `overrides` → `^0.7.2` |
  | ai <5.0.52 | low (filetype-whitelist bypass on uploads) | direct in `@launchkit/proxy` | AI SDK v4→v5 migration |
- `.github/workflows/` contains only `ci.yml`. No `canary.yml`, no `release.yml`. No git tags.
- Versions: root has none; `apps/desktop` = `0.0.1`; `electrobun.config.ts` app.version = `0.0.1`;
  all `packages/*` + `tooling/*` = `0.0.0`.
- Two shippable artifacts:
  - **Desktop app** — `electrobun build` (Electrobun 1.18.1). Only macOS arm64 has ever built.
  - **CLI** — `@launchkit/cli` is a **library barrel** (`exports: "./src/index.ts"`, exports
    `runCli`). It has **no** executable entry / `bin` / shebang, so a standalone binary needs one.
- SDK isolation: all `ai`/`@ai-sdk/*` usage lives behind the `LanguageModelGateway` adapter in
  exactly two files — `packages/proxy/src/providers/real-gateway.ts` (one `streamText` call) and
  `packages/proxy/src/providers/load-sdk.ts` (14 `create*` provider factories).

## Decisions

- **Keep `bun audit` blocking; fix all 8 advisories with zero `--ignore`.** (User choice.)
- **Full AI SDK migration**, targeting the **latest `ai` v5.x line** (`^5`, currently 5.0.192) — not
  v6. The advisory is fixed at `ai@5.0.52`, so v5 fully resolves it while being a smaller, lower-risk
  jump than v6, and keeps third-party providers more likely compatible. v6 is a later, separate bump.
- **Build & publish both artifacts** (Electrobun app + CLI binary) across the **full platform
  matrix**: macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64.
- **Version line 0.1.0**, synced across the whole monorepo. Canary tags are `v0.1.0-canary.N`;
  first real release tag is `v0.1.0`.

## Architecture — three ordered workstreams

### A. Version sync → 0.1.0 (independent, trivial)
Add `"version": "0.1.0"` to root `package.json`. Set `0.1.0` in: `apps/desktop/package.json`,
`apps/desktop/electrobun.config.ts` (`app.version`), every `packages/*/package.json`, every
`tooling/*/package.json`. No code depends on these values at runtime, so no test impact; verified by
the existing gate (`typecheck && lint && test`).

### B. Dependency remediation (must precede blocking-audit `ci.yml`)
Done test-first per repo TDD rules; the proxy + UI suites are the safety net.

1. **Safe bumps / overrides** (no code change expected):
   - `happy-dom` and `@happy-dom/global-registrator` → `^20`. Re-run the full suite; the DOM-test
     setup (`@testing-library/*`, happy-dom registrator) is the risk surface — fix any breakage.
   - `turbo` → latest (>2.9.13).
   - Add `overrides` (root `package.json`): `uuid: ^11.1.1`, `jsondiffpatch: ^0.7.2`. Re-run suite.
2. **AI SDK v4 → v5 migration** in `@launchkit/proxy`:
   - Bump `ai` → `^5` and all `@ai-sdk/*` providers in `packages/proxy/package.json` to their
     v5-compatible majors.
   - **`real-gateway.ts`**: `streamText` option `maxTokens` → `maxOutputTokens`; update `fullStream`
     part handling to v5 shapes (text-delta `.textDelta` → `.text`; verify finish/error part shapes).
     Update tests first (RED) to the new shapes.
   - **`load-sdk.ts`**: re-verify each of the 14 `create*` factory exports still exists under the new
     majors; adjust import names if any changed.
   - **Watch item — `ollama-ai-provider`**: 1.x targets `ai` v4 and may not support v5. If
     incompatible, switch to the v5-compatible successor package (e.g. `ollama-ai-provider-v2`) or
     equivalent, adjusting the `load-sdk.ts` `ollama` case. Resolve under TDD.
   - **End state:** `bun audit` exits 0 with **no** `--ignore` flags.

### C. CI/CD pipeline
1. **`@launchkit/cli` executable entry** — add `src/bin.ts`: a shebang (`#!/usr/bin/env bun`) entry
   that calls `runCli` with the real injected deps (mirroring how `apps/desktop` wires them). Add a
   `bin` field + a `compile` script (`bun build --compile src/bin.ts --outfile <name>`). Covered by a
   smoke test that the compiled binary runs `--help`/`--version`.
2. **`ci.yml` (gate)** — unchanged structure, `bun audit` stays blocking (now green after B):
   checkout → `oven-sh/setup-bun` → `bun install --frozen-lockfile` → `typecheck` → `lint` →
   `bun test` → `bun audit`. Triggers: PR + push to `main`.
3. **`canary.yml`** — on push to `main`. `concurrency: cancel-in-progress`. Jobs:
   - `gate` — same checks as `ci.yml`.
   - `build` (matrix, `needs: gate`) — per target: `electrobun build` → archive the app bundle
     (`.tar.gz` unix / `.zip` win) **and** `bun run --filter @launchkit/cli compile` → archive the
     CLI binary; `upload-artifact`. Non-mac Electrobun targets are gated (`continue-on-error` or a
     guarded step) so a failed app build falls back to **CLI-only** for that platform instead of
     failing the release.
   - `release` (`needs: build`) — download artifacts; derive `TAG=v0.1.0-canary.N` by reading
     `version` from root `package.json` and finding the max existing `canary.N` via
     `gh release list`; rename artifacts with the tag; `sha256sum` checksums; `gh release create
     --prerelease --target <sha>`.
4. **`release.yml`** — on push of tag `v*`. Same `gate` + `build` jobs; `release` job publishes a
   non-prerelease GitHub Release at the pushed tag (`gh release create <tag>`), with the same
   artifact renaming + checksums. (Argon has no tag-release workflow; this is designed fresh on the
   same packaging shape.)

Artifact naming: `launchkit-<os>-<arch>` for the app archive, `launchkit-cli-<os>-<arch>` for the
CLI binary, suffixed with the tag.

## Risks / open watch items

- **Electrobun cross-platform builds are unverified** (only macOS arm64 has built). Mitigation: gate
  non-mac app builds to fall back to CLI-only; treat full-matrix app builds as best-effort for the
  first canary, then harden.
- **`ollama-ai-provider` v5 compatibility** — see B.2; may require a replacement package.
- **happy-dom v20 test breakage** — caught by the existing suite; fix under TDD.
- **Code signing / notarization** — out of scope; canary + first releases are unsigned. macOS
  `createDmg: false` stays. Signing is a later enhancement.

## Out of scope

- AI SDK v6 (deferred; v5 resolves the advisory).
- Code signing, notarization, auto-update / Electrobun update channels.
- Publishing to npm or app stores (GitHub Releases only).

## Verification (definition of done)

- `bun run typecheck && bun run lint && bun test` green.
- `bun audit` exits 0 with no `--ignore`.
- Root `package.json` has `version: "0.1.0"`; monorepo versions synced.
- A push to `main` produces a `v0.1.0-canary.N` prerelease with app + CLI artifacts for the matrix.
- Pushing a `v*` tag produces a corresponding non-prerelease release.
