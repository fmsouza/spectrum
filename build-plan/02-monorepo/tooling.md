# Monorepo — Tooling

Concrete config the `phase0` plan creates. Versions are pinned at scaffold time (latest stable, then locked in `bun.lock`).

## Bun workspaces (root `package.json`)

```jsonc
{
  "name": "launchkit-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*", "tooling/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "turbo": "pinned",
    "@biomejs/biome": "pinned",
    "typescript": "pinned",
    "@types/bun": "pinned",
    "happy-dom": "pinned",
    "@testing-library/react": "pinned",
    "@testing-library/jest-dom": "pinned"
  }
}
```

Internal packages are referenced by consumers as `"@launchkit/x": "workspace:*"`.

## Turborepo (`turbo.json`)

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": [], "cache": true },
    "lint": { "outputs": [] }
  }
}
```

`^build` makes a package wait for its dependencies. Correct `inputs`/`outputs` keep caching sound.

## Biome (`biome.json`)

Single tool for lint + format. Key rules turned **on as errors**:
- `suspicious/noExplicitAny`
- `style/useImportType` (matches `verbatimModuleSyntax`)
- `correctness/noUnusedVariables`, `correctness/noUnusedImports`
- `complexity/noUselessLodashChains`-style cleanliness rules (defaults)
- formatter: 2-space indent, double quotes, trailing commas `all`, semicolons as-needed (pick one; phase0 locks it).

A `nursery`/custom boundary rule (or a small lint script) enforces "no deep cross-package imports" (`02-monorepo/boundaries.md` rule 2).

## tsconfig strategy

- `tooling/tsconfig/base.json` — the strict base from `01-conventions/typescript.md`.
- `tooling/tsconfig/package.json` — extends base for a library package (`composite: true`, `rootDir: src`).
- `tooling/tsconfig/react.json` — extends package + `"jsx": "react-jsx"`, DOM libs.
- Each package's `tsconfig.json` extends the right preset and lists `references` to its dependency packages.
- Root `tsconfig.json` references all packages so `bun run typecheck` and the editor see the whole graph.

## `bunfig.toml`

```toml
[test]
preload = ["./test/setup.ts"]   # registers happy-dom + @testing-library/jest-dom matchers
```

`test/setup.ts` calls happy-dom's `GlobalRegistrator.register()` so React tests have a DOM, and extends `expect` with jest-dom matchers.

## Electrobun

`electrobun init` (run in `phase0`) scaffolds the desktop app shell; we then point its entry at `apps/desktop/src/main.ts` and its view at `apps/desktop/views/main`. `electrobun.config.ts` declares entrypoints, views, and bundle settings. Version pinned.

## CI (GitHub Actions — set up in `phase0`)

A single workflow on push/PR: `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint` → `bun test` → `bun audit`. Turbo cache restored between runs.
