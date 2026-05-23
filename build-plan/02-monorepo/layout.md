# Monorepo — Layout

Bun workspaces + Turborepo. **One app** (`apps/desktop`), the rest are domain **packages**.

```
launchkit/
├── package.json              # workspace root: "workspaces", scripts, devDeps (turbo, biome, typescript)
├── bun.lock
├── turbo.json                # pipeline + caching
├── biome.json                # lint + format
├── bunfig.toml               # bun test preload (happy-dom), test config
├── tsconfig.base.json        # strict base, extended by every package
├── tsconfig.json             # solution-style references for editor + `bun run typecheck`
│
├── apps/
│   └── desktop/              # the single Electrobun binary (CLI + GUI)
│       ├── package.json      # name: "launchkit" (the bin), deps: all @launchkit/* packages
│       ├── electrobun.config.ts
│       ├── tsconfig.json
│       ├── src/
│       │   ├── main.ts                 # dual-mode entry: detect CLI vs GUI
│       │   └── gui/
│       │       ├── window.ts           # create BrowserWindow + app menu
│       │       ├── tray.ts             # system tray + quick-launch submenu
│       │       └── ipc/handlers.ts     # bind @launchkit/ipc contract to subsystems
│       └── views/main/                 # React webview
│           ├── index.html
│           ├── app.tsx                 # router + IPC client setup
│           ├── ipc-client.ts           # typed client over Electrobun IPC
│           ├── hooks/                  # useProviders, useAliases, … (data entry point)
│           └── pages/                  # Dashboard, Providers, Routing, Harnesses, Sessions
│
├── packages/
│   ├── types/                # @launchkit/types
│   │   └── src/{provider,alias,harness,session,index}.ts  (+ *.test.ts)
│   ├── utils/                # @launchkit/utils — result, pipe, template, redact, id, branded
│   ├── secrets/              # @launchkit/secrets — keychain adapter + interface
│   ├── ipc/                  # @launchkit/ipc — contract types + (de)serialization + client/server helpers
│   ├── ui/                   # @launchkit/ui — React atomic design system
│   │   └── src/{atoms,molecules,organisms,templates}/...  (+ index.ts barrels)
│   ├── config/               # @launchkit/config — store, defaults, migrations, schema
│   ├── sessions/             # @launchkit/sessions — bun:sqlite store + interface
│   ├── proxy/                # @launchkit/proxy — server, adapters/, router, providers/factory, serializers/
│   ├── harnesses/            # @launchkit/harnesses — registry, launcher, builtin/, schema
│   └── cli/                  # @launchkit/cli — argv parse + commands/
│
└── tooling/
    ├── tsconfig/             # @launchkit/tsconfig — base.json, package.json (preset), react.json
    └── biome-config/         # @launchkit/biome-config — shared Biome preset
```

## Conventions for every package

- `package.json`: `"name": "@launchkit/<pkg>"`, `"type": "module"`, `"private": true`, `"exports": { ".": "./src/index.ts" }`, a `"typecheck"` script (`tsc --noEmit`), and a `"test"` script (`bun test`).
- `tsconfig.json`: `extends` the shared preset; sets `composite`/`references` to its dependency packages.
- `src/index.ts`: the **only** public surface (barrel). Everything consumers use is re-exported here.
- Tests co-located as `*.test.ts` / `*.test.tsx`; integration tests `*.integration.test.ts`; fixtures under `__fixtures__/`.
- A short `CLAUDE.md` per package (see `03-claude-config/package-claude-md.md`).

## Why one app

"One binary, two modes" (architecture §). The CLI and GUI are the same Electrobun binary deciding behavior from `process.argv`. So there is a single `apps/desktop` that imports `@launchkit/cli` for CLI mode and mounts the webview for GUI mode. The CLI is a *package* (pure, testable command logic) consumed by the app shell; it is not a separate binary.
