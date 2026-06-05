# Routing/Alias → Models Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing "Routing/Alias" concept with a "Models" concept: a configured model is an opaque-id → (provider, providerModel) route; the session Model picker always offers a "default" option that bypasses the proxy and uses the harness's own native model/credentials.

**Architecture:** The core type `ModelAlias` (named handle) becomes `ModelRoute` (opaque `ModelId` + provider + providerModel), stored in `config.models`. The harness-level `defaultAlias` is removed; "default" is a universal picker choice meaning *bypass the proxy entirely* (launch the harness without rendering its proxy `envTemplate`). Sessions/Profiles reference an optional `modelId` (absent = default/bypass). A config migration (v3→v4) and a sqlite column rename preserve existing state.

**Tech Stack:** Bun + TypeScript (strict, no `any`), zod schemas as source of truth, `Result<T,E>` (never throw), Jest-API `bun test`, React atomic-design UI, bun:sqlite. Monorepo via Bun workspaces + Turborepo.

---

## Execution notes (READ FIRST)

- **This is an atomic, breaking rename rooted in `@launchkit/types`.** Changing the root type breaks every consumer simultaneously. Therefore:
  - Do all tasks **on one branch**, in order.
  - **Per-task gate = the changed package's own tests**, e.g. `bun test packages/types`. The full-monorepo `bun run typecheck` will be RED in the middle of the refactor and only goes GREEN at the very end.
  - **Task 11 is the integration gate**: full `bun run typecheck && bun run lint && bun test` must be green before the feature is done. Update `build-plan/PROGRESS.md` with the commit SHA there (and per-task as the project requires).
- **TDD per task:** write/convert the failing test (observe RED), implement (GREEN), refactor, commit. Many tests already exist for the alias concept — converting them counts as the RED step (run the converted test against old code → it fails).
- **No `any`. Explicit input/output types. Pure functions; effects already sit behind injected adapters.** Follow the surrounding code's style exactly.
- Before starting: create the branch.

```bash
git checkout -b models-rename
git log --oneline -1   # expect the spec commit ancestry
```

---

## File map

**types** (`packages/types/src`): `ids.ts` (add `ModelId`, remove `AliasName`), `alias.ts`→`model-route.ts`, `harness.ts` (drop `defaultAlias`), `session.ts` (`alias`→`modelId?`), `profile.ts` (`alias`→`modelId?`), `index.ts` barrel. Tests: `alias.test.ts`→`model-route.test.ts`, `harness.test.ts`.

**config** (`packages/config/src`): `schema.ts` (`aliases`→`models`, bump version 3→4), `migrations.ts` (add `v3ToV4`). Tests: `schema.test.ts`, `migrations.test.ts`.

**proxy** (`packages/proxy/src`): `types.ts` (`unknown-alias`→`unknown-model`), `router.ts` (key by id), `handler.ts` (error mapping). Tests: `router.test.ts`, `handler.test.ts`.

**harnesses** (`packages/harnesses/src`): `launch.ts` (discriminated proxied/direct mode), `builtin/{claude,codex,opencode,openclaw}.ts` (drop `defaultAlias`). Tests: `launch.test.ts`, `builtin/index.test.ts`.

**sessions** (`packages/sessions/src`): `store.ts` (column `alias`→`modelId` nullable + rename migration in `init`). Tests: `store.test.ts`.

**ipc** (`packages/ipc/src`): `methods.ts` (model methods + `launchHarness.modelId`). Tests: `methods.test.ts`.

**desktop main** (`apps/desktop/src/gui`): `ipc/handlers.ts` (model CRUD + routed/bypass launch), `tray.ts`/`tray-menu.ts` (bypass launch). Tests: `ipc/handlers.test.ts`, `tray.test.ts`.

**cli** (`packages/cli/src`): `mutate-command.ts` (`model add/remove`), `launch-command.ts` (`resolveModel`). Tests: `mutate-command.test.ts`, `launch-command.test.ts`, `launch-profile.test.ts`, `list.test.ts`.

**ui** (`packages/ui/src`): `molecules/AliasRow.tsx`→`ModelRow.tsx`, `organisms/AliasTable.tsx`→`ModelTable.tsx`, `organisms/NewSessionModal.tsx` (Model picker + default option), `organisms/HarnessForm.tsx` (drop default-alias field), `index.ts` barrels. Tests co-located.

**desktop views** (`apps/desktop/views/main`): `pages/RoutingPage.tsx`→`ModelsPage.tsx`, `hooks/useAliases.ts`→`useModels.ts`, `views/SettingsView.tsx` (nav label), `pages/HarnessesPage.tsx` (drop defaultAlias). Tests co-located.

---

## Task 1: types — ModelRoute, ModelId, drop defaultAlias, optional modelId

**Files:**
- Modify: `packages/types/src/ids.ts`
- Rename: `packages/types/src/alias.ts` → `packages/types/src/model-route.ts`
- Modify: `packages/types/src/harness.ts`, `session.ts`, `profile.ts`, `index.ts`
- Test: rename `packages/types/src/alias.test.ts` → `model-route.test.ts`; modify `harness.test.ts`

- [ ] **Step 1: Convert the schema test (RED).** Move the file and rewrite it:

```bash
git mv packages/types/src/alias.test.ts packages/types/src/model-route.test.ts
```

Replace its contents with:

```ts
import { describe, expect, it } from "bun:test"
import { ModelRouteSchema } from "./model-route"

describe("ModelRouteSchema", () => {
  it("parses a valid model route when all fields are present", () => {
    const parsed = ModelRouteSchema.parse({
      id: "mdl_123",
      providerId: "openai",
      providerModel: "gpt-4o",
    })
    expect(String(parsed.id)).toBe("mdl_123")
    expect(String(parsed.providerId)).toBe("openai")
    expect(parsed.providerModel).toBe("gpt-4o")
  })

  it("rejects an empty providerModel when parsing", () => {
    expect(() =>
      ModelRouteSchema.parse({
        id: "mdl_123",
        providerId: "openai",
        providerModel: "",
      }),
    ).toThrow()
  })

  it("rejects an empty id when parsing", () => {
    expect(() =>
      ModelRouteSchema.parse({
        id: "",
        providerId: "openai",
        providerModel: "gpt-4o",
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run it (RED).** `bun test packages/types/src/model-route.test.ts` → FAIL (`./model-route` not found).

- [ ] **Step 3: Add `ModelId`, remove `AliasName` in `ids.ts`.** Replace the alias lines:

```ts
// remove these two lines:
// export const AliasNameSchema = z.string().min(1).brand<"AliasName">()
// export type AliasName = z.infer<typeof AliasNameSchema>

// add:
export const ModelIdSchema = z.string().min(1).brand<"ModelId">()
export type ModelId = z.infer<typeof ModelIdSchema>
```

- [ ] **Step 4: Create `model-route.ts`** (replacing `alias.ts`):

```bash
git rm packages/types/src/alias.ts
```

Create `packages/types/src/model-route.ts`:

```ts
import { z } from "zod"
import { ModelIdSchema, ProviderIdSchema } from "./ids"

export const ModelRouteSchema = z
  .object({
    id: ModelIdSchema,
    providerId: ProviderIdSchema,
    providerModel: z.string().min(1),
  })
  .strict()

export type ModelRoute = z.infer<typeof ModelRouteSchema>
```

- [ ] **Step 5: Drop `defaultAlias` from `harness.ts`.** Remove the `defaultAlias` field and the now-unused `AliasNameSchema` import:

```ts
import { z } from "zod"
import { ApiFormatSchema } from "./enums"
import { HarnessIdSchema } from "./ids"

export const HarnessDefinitionSchema = z
  .object({
    id: HarnessIdSchema,
    name: z.string().min(1),
    command: z.string().min(1),
    apiFormat: ApiFormatSchema,
    envTemplate: z.record(z.string(), z.string()),
    description: z.string().optional(),
    builtIn: z.boolean(),
  })
  .strict()

export type HarnessDefinition = z.infer<typeof HarnessDefinitionSchema>
```

- [ ] **Step 6: `session.ts` — `alias` → optional `modelId`:**

```ts
import { z } from "zod"
import { HarnessIdSchema, ModelIdSchema, SessionIdSchema } from "./ids"

export const SessionSchema = z
  .object({
    id: SessionIdSchema,
    harnessId: HarnessIdSchema,
    modelId: ModelIdSchema.optional(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
    exitCode: z.number().int().optional(),
    name: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
  })
  .strict()

export type Session = z.infer<typeof SessionSchema>
```

- [ ] **Step 7: `profile.ts` — `alias` → optional `modelId`:**

```ts
import { z } from "zod"
import { HarnessIdSchema, ModelIdSchema, ProfileIdSchema } from "./ids"

export const ProfileSchema = z
  .object({
    id: ProfileIdSchema,
    name: z.string().min(1),
    harnessId: HarnessIdSchema,
    modelId: ModelIdSchema.optional(),
    env: z.record(z.string(), z.string()),
  })
  .strict()

export type Profile = z.infer<typeof ProfileSchema>
```

- [ ] **Step 8: Update barrel `index.ts`.** Replace any `export * from "./alias"` / `AliasNameSchema`/`AliasName` exports. The barrel should export from `./model-route` and the new `ModelIdSchema`/`ModelId` from `./ids`; remove `ModelAliasSchema`/`ModelAlias`/`AliasNameSchema`/`AliasName`. Inspect the file and edit:

```bash
grep -n "alias\|Alias" packages/types/src/index.ts
```

Change `export * from "./alias"` → `export * from "./model-route"` (or the explicit named exports equivalently: export `ModelRouteSchema`, `ModelRoute`, `ModelIdSchema`, `ModelId`; drop the alias names).

- [ ] **Step 9: Fix `harness.test.ts` (RED→GREEN).** Find every fixture that sets `defaultAlias` and remove that property; remove any `AliasNameSchema` import. Run:

```bash
grep -n "defaultAlias\|AliasName" packages/types/src/harness.test.ts
```

Delete those lines/properties. If a test asserted `defaultAlias` parsing, delete that test case.

- [ ] **Step 10: Run the package tests (GREEN).** `bun test packages/types` → PASS. (`bun run typecheck` monorepo-wide is expected RED now; that's fine — see Execution notes.)

- [ ] **Step 11: Commit.**

```bash
git add packages/types
git commit -m "types: ModelRoute/ModelId, drop defaultAlias, optional session/profile modelId"
```

---

## Task 2: config — config.models + migration v3→v4

**Files:**
- Modify: `packages/config/src/schema.ts`, `packages/config/src/migrations.ts`
- Test: `packages/config/src/schema.test.ts`, `packages/config/src/migrations.test.ts`

- [ ] **Step 1: Write the migration test (RED).** Append to `packages/config/src/migrations.test.ts`:

```ts
describe("v3 → v4 (aliases → models)", () => {
  it("converts aliases to models keyed by the old alias name and rewrites profile refs", () => {
    const raw = {
      version: 3,
      providers: [],
      aliases: [{ alias: "fast", providerId: "openai", providerModel: "gpt-4o-mini" }],
      profiles: [
        { id: "p1", name: "Fast", harnessId: "claude", alias: "fast", env: {} },
      ],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    const result = runMigrations(raw)
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.version).toBe(4)
    expect(result.value.models).toEqual([
      { id: "fast", providerId: "openai", providerModel: "gpt-4o-mini" },
    ])
    expect(result.value.profiles[0]?.modelId).toBe("fast")
    expect("aliases" in result.value).toBe(false)
  })

  it("drops a legacy defaultAlias-bearing field on profiles without one (no modelId)", () => {
    const raw = {
      version: 3,
      providers: [],
      aliases: [],
      profiles: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    const result = runMigrations(raw)
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.models).toEqual([])
  })
})
```

Ensure the test file imports `isOk` from `@launchkit/utils` (match existing imports at the top of the file).

- [ ] **Step 2: Run it (RED).** `bun test packages/config/src/migrations.test.ts` → FAIL (still v3; `models` missing; `aliases` present).

- [ ] **Step 3: Update `schema.ts`.** Change the import and the two fields and bump the version:

```ts
import { ModelRouteSchema, ProfileSchema, ProviderSchema } from "@launchkit/types"
// ...
export const CURRENT_CONFIG_VERSION = 4
// in ConfigSchema:
    models: z.array(ModelRouteSchema),   // was: aliases: z.array(ModelAliasSchema)
// in defaultConfig():
  models: [],                            // was: aliases: []
```

- [ ] **Step 4: Add the `v3ToV4` migration in `migrations.ts`.** Insert before the `migrations` array:

```ts
/**
 * v4 reframes "aliases" as "models": each alias becomes a ModelRoute whose opaque `id` is the
 * old alias name (already unique within a config, so profile references map without lookups).
 * Profiles' `alias` becomes `modelId`. The harness-level `defaultAlias` is gone entirely; a
 * "default" launch now bypasses the proxy and needs no stored handle.
 */
const v3ToV4: Migration = {
  from: 3,
  to: 4,
  migrate: (raw) => {
    const aliases = Array.isArray(raw.aliases) ? raw.aliases : []
    const models = aliases.map((entry) => {
      const a = asRecord(entry)
      return {
        id: a.alias,
        providerId: a.providerId,
        providerModel: a.providerModel,
      }
    })
    const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(
      (entry) => {
        const { alias, ...rest } = asRecord(entry)
        return alias === undefined ? rest : { ...rest, modelId: alias }
      },
    )
    const { aliases: _drop, ...rest } = raw
    void _drop
    return { ...rest, version: 4, models, profiles }
  },
}
```

Then add it to the ordered list:

```ts
export const migrations: readonly Migration[] = [v1ToV2, v2ToV3, v3ToV4]
```

- [ ] **Step 5: Update `schema.test.ts`.** Replace `aliases` with `models` in fixtures and any assertion that referenced the alias array. Run `grep -n "aliases\|alias" packages/config/src/schema.test.ts` and edit each fixture to use `models: [...]` with `{ id, providerId, providerModel }` entries.

- [ ] **Step 6: Run package tests (GREEN).** `bun test packages/config` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/config
git commit -m "config: aliases->models, add v3->v4 migration, bump to v4"
```

---

## Task 3: proxy — resolve by id, unknown-model error

**Files:**
- Modify: `packages/proxy/src/types.ts`, `packages/proxy/src/router.ts`, `packages/proxy/src/handler.ts`
- Test: `packages/proxy/src/router.test.ts`, `packages/proxy/src/handler.test.ts`

- [ ] **Step 1: Convert `router.test.ts` (RED).** Update fixtures to use `models` and ids, and rename the error expectation:

```ts
// config fixture: replace `aliases: [...]` with:
models: [{ id: "mdl_fast", providerId: "openai", providerModel: "gpt-4o" }],
// resolve happy-path:
const r = router.resolve("mdl_fast")
// ...expect ok with provider + providerModel "gpt-4o"
// unknown case:
const r2 = router.resolve("nope")
expect(isErr(r2)).toBe(true)
if (isErr(r2)) expect(r2.error).toEqual({ kind: "unknown-model", id: "nope" })
```

Keep the existing `unknown-provider` case (a model whose `providerId` isn't in `providers`).

- [ ] **Step 2: Run it (RED).** `bun test packages/proxy/src/router.test.ts` → FAIL.

- [ ] **Step 3: Update `types.ts` ProxyError.** Replace the `unknown-alias` member:

```ts
  | { readonly kind: "unknown-model"; readonly id: string }
```

- [ ] **Step 4: Update `router.ts`.** Key the map by id and resolve by id:

```ts
export const createRouter = (config: Config): Router => {
  const providers = new Map(config.providers.map((p) => [p.id as string, p]))
  const models = new Map(config.models.map((m) => [m.id as string, m]))
  return {
    resolve: (id) => {
      const m = models.get(id)
      if (m === undefined) return err({ kind: "unknown-model", id })
      const provider = providers.get(m.providerId as string)
      if (provider === undefined)
        return err({ kind: "unknown-provider", providerId: m.providerId as string })
      return ok({ provider, providerModel: m.providerModel })
    },
  }
}
```

If `Router.resolve`'s parameter is typed, keep it `string` (the request's `model` field is a plain string carrying the id). Adjust the `Router` interface's doc comment from "alias" to "model id".

- [ ] **Step 5: Update `handler.ts` error mapping.** Find where `unknown-alias` is mapped to an HTTP response and rename to `unknown-model`:

```bash
grep -n "unknown-alias\|alias" packages/proxy/src/handler.ts
```

Map `unknown-model` to the same status the old `unknown-alias` used (e.g. 400/404 — preserve the existing code/body shape, just rename the kind and use `id` in the detail).

- [ ] **Step 6: Update `handler.test.ts`.** Replace `aliases`→`models`, alias names→ids, and any `unknown-alias` assertion→`unknown-model`. Run `grep -n "alias" packages/proxy/src/handler.test.ts` and edit each.

- [ ] **Step 7: Run package tests (GREEN).** `bun test packages/proxy` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add packages/proxy
git commit -m "proxy: resolve by model id, unknown-model error"
```

---

## Task 4: harnesses — proxied/direct launch + builtins drop defaultAlias

**Files:**
- Modify: `packages/harnesses/src/launch.ts`, `packages/harnesses/src/builtin/{claude,codex,opencode,openclaw}.ts`
- Test: `packages/harnesses/src/launch.test.ts`, `packages/harnesses/src/builtin/index.test.ts`

- [ ] **Step 1: Write the direct-mode (bypass) test (RED).** Add to `launch.test.ts`:

```ts
it("renders no proxy env in direct (bypass) mode — only caller env reaches the harness", () => {
  const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
  const resolve = resolveHarnessLaunch({ resolver })
  const result = resolve({
    harness: claude,
    route: { kind: "direct" },
    env: { FOO: "bar" },
  })
  expect(isOk(result)).toBe(true)
  if (!isOk(result)) return
  expect(result.value.command).toBe("/usr/local/bin/claude")
  // None of the harness's proxy-pointing env vars are injected:
  expect(result.value.env.ANTHROPIC_BASE_URL).toBeUndefined()
  expect(result.value.env.ANTHROPIC_API_KEY).toBeUndefined()
  expect(result.value.env.ANTHROPIC_MODEL).toBeUndefined()
  expect(result.value.env.FOO).toBe("bar")
})
```

Update the EXISTING proxied test(s) to the new param shape: replace `proxyUrl/proxyKey/model` top-level fields with `route: { kind: "proxied", proxyUrl, proxyKey, modelId: ModelIdSchema.parse("mdl_x") }` and assert `ANTHROPIC_MODEL === "mdl_x"`.

- [ ] **Step 2: Run it (RED).** `bun test packages/harnesses/src/launch.test.ts` → FAIL (type/shape mismatch + bypass not implemented).

- [ ] **Step 3: Rewrite `launch.ts`.** Replace `LaunchParams` and `resolveHarnessLaunch`:

```ts
import type { HarnessDefinition, ModelId } from "@launchkit/types"
import { type Result, err, isErr, ok, renderTemplate } from "@launchkit/utils"
import type { CommandResolver } from "./command-resolver"
import type { HarnessError } from "./errors"
import type { ProcessSpawner, SpawnedProcess } from "./process-spawner"
import { validateEnvTemplate } from "./validate-env-template"

export type LaunchRoute =
  | {
      readonly kind: "proxied"
      readonly proxyUrl: string
      readonly proxyKey: string
      readonly modelId: ModelId
    }
  | { readonly kind: "direct" }

export interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly route: LaunchRoute
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}

export interface ResolvedHarnessLaunch {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Record<string, string>
}

export const resolveHarnessLaunch =
  (deps: { readonly resolver: CommandResolver }) =>
  (params: LaunchParams): Result<ResolvedHarnessLaunch, HarnessError> => {
    const { harness, route } = params

    // Resolve + validate the command in BOTH modes (rejects relative / `..`).
    const resolved = deps.resolver.resolve(harness.command)
    if (isErr(resolved)) return resolved

    // Direct (bypass) mode: do NOT render the proxy envTemplate. The harness uses its own
    // native credentials/model and the proxy is not involved. Only caller env is passed.
    if (route.kind === "direct") {
      return ok({
        command: resolved.value,
        args: [],
        env: { ...(params.env ?? {}) },
      })
    }

    // Proxied mode: restrict env-template tokens, then render with the three allowed vars.
    const templateCheck = validateEnvTemplate(harness.envTemplate)
    if (isErr(templateCheck)) return templateCheck

    const vars: Readonly<Record<string, string>> = {
      proxyUrl: route.proxyUrl,
      proxyKey: route.proxyKey,
      model: String(route.modelId),
    }
    const env: Record<string, string> = {}
    for (const [key, template] of Object.entries(harness.envTemplate)) {
      const rendered = renderTemplate(template, vars)
      if (isErr(rendered)) {
        return err({ kind: "invalid-template", token: rendered.error.token })
      }
      env[key] = rendered.value
    }

    // params.env WINS over the rendered template env (callers can override / add vars).
    return ok({ command: resolved.value, args: [], env: { ...env, ...(params.env ?? {}) } })
  }

export const launchHarness =
  (deps: {
    readonly resolver: CommandResolver
    readonly spawner: ProcessSpawner
  }) =>
  (params: LaunchParams): Result<SpawnedProcess, HarnessError> => {
    const resolved = resolveHarnessLaunch({ resolver: deps.resolver })(params)
    if (isErr(resolved)) return resolved
    const { command, args, env } = resolved.value
    return deps.spawner.spawn(command, [...args], env, params.cwd)
  }
```

- [ ] **Step 4: Drop `defaultAlias` from each builtin.** In `claude.ts`, `codex.ts`, `opencode.ts`, `openclaw.ts`: remove the `defaultAlias: AliasNameSchema.parse("default"),` line and the `AliasNameSchema` import (keep `HarnessIdSchema`/`HarnessDefinition`). Example `claude.ts`:

```ts
import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"

export const claude: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    ANTHROPIC_API_KEY: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  builtIn: true,
} satisfies HarnessDefinition
```

- [ ] **Step 5: Update `builtin/index.test.ts`** (and any other harness test) — remove `defaultAlias` assertions: `grep -rn "defaultAlias" packages/harnesses/src` and delete those lines.

- [ ] **Step 6: Run package tests (GREEN).** `bun test packages/harnesses` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/harnesses
git commit -m "harnesses: proxied/direct launch modes, drop builtin defaultAlias"
```

---

## Task 5: sessions — modelId column (nullable) + rename migration

**Files:**
- Modify: `packages/sessions/src/store.ts`
- Test: `packages/sessions/src/store.test.ts`

- [ ] **Step 1: Write the modelId tests (RED).** Add to `store.test.ts` (match the existing harness for building a store with the in-memory db):

```ts
it("creates a session with a modelId and reads it back", () => {
  const store = makeStore() // existing test helper; or construct with createInMemoryDatabase()
  store.init()
  const created = store.create({
    harnessId: "claude" as HarnessId,
    modelId: "mdl_fast" as ModelId,
  })
  expect(isOk(created)).toBe(true)
  if (!isOk(created)) return
  expect(String(created.value.modelId)).toBe("mdl_fast")
})

it("creates a default (bypass) session with no modelId", () => {
  const store = makeStore()
  store.init()
  const created = store.create({ harnessId: "claude" as HarnessId })
  expect(isOk(created)).toBe(true)
  if (!isOk(created)) return
  expect(created.value.modelId).toBeUndefined()
})
```

Convert any existing test that passed `alias:` to `modelId:` (and any filter test from `alias`→`modelId`). Import `ModelId` from `@launchkit/types`.

- [ ] **Step 2: Run it (RED).** `bun test packages/sessions/src/store.test.ts` → FAIL.

- [ ] **Step 3: Update `store.ts`.** Apply these edits:

`SessionInput` / `SessionFilter`:

```ts
import type { HarnessId, ModelId, Session, SessionId } from "@launchkit/types"

export type SessionInput = {
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  readonly name?: string
  readonly cwd?: string
}

export type SessionFilter = {
  readonly harnessId?: HarnessId
  readonly modelId?: ModelId
  readonly since?: string
  readonly running?: boolean
  readonly limit?: number
  readonly offset?: number
}
```

SQL constants — `modelId` is now nullable (default sessions have none); add a rename-migration constant:

```ts
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  harnessId TEXT NOT NULL,
  modelId TEXT,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  exitCode INTEGER
)`

const RENAME_ALIAS_COLUMN =
  "ALTER TABLE sessions RENAME COLUMN alias TO modelId"
const INSERT_SESSION =
  "INSERT INTO sessions (id, harnessId, modelId, startedAt, name, cwd) VALUES (?, ?, ?, ?, ?, ?)"
const SELECT_COLUMNS =
  "SELECT id, harnessId, modelId, startedAt, endedAt, exitCode, name, cwd FROM sessions"
```

`toSession` — map `modelId`, treating NULL/missing as absent:

```ts
const toSession = (row: Record<string, unknown>): Session => {
  const base: Session = {
    id: row.id as SessionId,
    harnessId: row.harnessId as HarnessId,
    startedAt: String(row.startedAt),
  }
  const modelId = row.modelId
  const endedAt = row.endedAt
  const exitCode = row.exitCode
  const name = row.name
  const cwd = row.cwd
  return {
    ...base,
    ...(typeof modelId === "string" ? { modelId: modelId as Session["modelId"] } : {}),
    ...(typeof endedAt === "string" ? { endedAt } : {}),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof cwd === "string" ? { cwd } : {}),
  }
}
```

`buildWhere` — filter by `modelId`:

```ts
  if (filter.modelId !== undefined) {
    conditions.push("modelId = ?")
    params.push(filter.modelId)
  }
```

`init` — after the existing column checks, rename a legacy `alias` column on pre-existing DBs (the `existing` set is already computed from `PRAGMA table_info`):

```ts
    // Legacy DBs (config ≤ v3 era) have an `alias` column; rename it to `modelId` so historical
    // sessions survive. New DBs already have `modelId` from CREATE_TABLE. (SQLite ≥3.25.)
    if (existing.has("alias") && !existing.has("modelId")) {
      const renamed = db.exec(RENAME_ALIAS_COLUMN)
      if (isErr(renamed)) return renamed
    }
```

`create` — insert `input.modelId ?? null` and conditionally include `modelId` in the returned object:

```ts
    create: (input: SessionInput): Result<Session, SessionError> => {
      const id = deps.idGen.next("s") as SessionId
      const startedAt = deps.clock.now().toISOString()
      const written = db.run(INSERT_SESSION, [
        id,
        input.harnessId,
        input.modelId ?? null,
        startedAt,
        input.name ?? null,
        input.cwd ?? null,
      ])
      if (isErr(written)) return written
      return ok({
        id,
        harnessId: input.harnessId,
        startedAt,
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      })
    },
```

- [ ] **Step 4: Run package tests (GREEN).** `bun test packages/sessions` → PASS. (Includes the "parameterized statements only" assertion — `modelId` is still a `?` param, so it stays green.)

- [ ] **Step 5: Commit.**

```bash
git add packages/sessions
git commit -m "sessions: modelId column (nullable) + alias->modelId rename migration"
```

---

## Task 6: ipc — model methods + launchHarness.modelId

**Files:**
- Modify: `packages/ipc/src/methods.ts` (and the method map / `IpcMethods` types it feeds)
- Test: `packages/ipc/src/methods.test.ts`

- [ ] **Step 1: Convert `methods.test.ts` (RED).** Replace alias-method assertions with model-method ones. For each prior `*Alias*` schema test, assert the `*Model*` equivalents:

```ts
it("AddModelParamsSchema accepts providerId + providerModel (server mints id)", () => {
  expect(
    AddModelParamsSchema.safeParse({ providerId: "openai", providerModel: "gpt-4o" }).success,
  ).toBe(true)
})

it("DeleteModelParamsSchema requires a model id", () => {
  expect(DeleteModelParamsSchema.safeParse({ id: "mdl_x" }).success).toBe(true)
  expect(DeleteModelParamsSchema.safeParse({}).success).toBe(false)
})

it("LaunchHarnessParamsSchema accepts an optional modelId", () => {
  expect(LaunchHarnessParamsSchema.safeParse({ id: "claude" }).success).toBe(true)
  expect(
    LaunchHarnessParamsSchema.safeParse({ id: "claude", modelId: "mdl_x" }).success,
  ).toBe(true)
})
```

- [ ] **Step 2: Run it (RED).** `bun test packages/ipc/src/methods.test.ts` → FAIL (symbols undefined).

- [ ] **Step 3: Rewrite the Aliases block in `methods.ts`.** Replace lines 79–100 (the `// ── Aliases ──` section) with a Models section, and update the top import (`ModelAliasSchema, AliasNameSchema` → `ModelRouteSchema, ModelIdSchema`):

```ts
// ── Models ───────────────────────────────────────────────────────────────────

export const GetModelsParamsSchema = z.undefined()
export const GetModelsResultSchema = z.array(ModelRouteSchema)

/** Add accepts provider + model only; the server mints the opaque id. */
export const AddModelParamsSchema = z
  .object({
    providerId: ProviderIdSchema,
    providerModel: z.string().min(1),
  })
  .strict()
export const AddModelResultSchema = ModelRouteSchema

/** Update keys by id and carries the new provider + model. */
export const UpdateModelParamsSchema = z
  .object({
    id: ModelIdSchema,
    input: ModelRouteSchema.omit({ id: true }),
  })
  .strict()
export const UpdateModelResultSchema = ModelRouteSchema

export const DeleteModelParamsSchema = z.object({ id: ModelIdSchema }).strict()
export const DeleteModelResultSchema = VoidSchema
```

Ensure `ProviderIdSchema` is imported (it likely already is). Update `LaunchHarnessParamsSchema` (lines 124–132): replace `alias: AliasNameSchema.optional()` with `modelId: ModelIdSchema.optional()`.

- [ ] **Step 4: Update the method-schema map & types.** Find where method names map to `{ params, result }` (the `IpcMethodSchemas` map and `IpcMethods`/`IpcHandlers` types):

```bash
grep -rn "getAliases\|addAlias\|updateAlias\|deleteAlias\|Alias" packages/ipc/src
```

Rename map keys `getAliases/addAlias/updateAlias/deleteAlias` → `getModels/addModel/updateModel/deleteModel`, pointing at the new schemas. Update any exported union of method names.

- [ ] **Step 5: Run package tests (GREEN).** `bun test packages/ipc` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/ipc
git commit -m "ipc: getModels/addModel/updateModel/deleteModel + launchHarness.modelId"
```

---

## Task 7: desktop main — model CRUD handlers + routed/bypass launch + tray

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts`, `apps/desktop/src/gui/tray.ts`, `apps/desktop/src/gui/tray-menu.ts` (if it carries the alias)
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`, `apps/desktop/src/gui/tray.test.ts`, `apps/desktop/src/gui/tray-menu.test.ts`

- [ ] **Step 1: Convert handler tests (RED).** In `handlers.test.ts`, replace alias CRUD tests with model CRUD, and split launch into routed vs bypass. Key new assertions:

```ts
it("addModel mints an id and persists the model", async () => {
  // config starts with models: []
  const created = await handlers.addModel({
    providerId: "openai" as ProviderId,
    providerModel: "gpt-4o",
  })
  expect(created.providerModel).toBe("gpt-4o")
  expect(String(created.id)).toMatch(/^mdl_/)
  // saved config now contains exactly that model
})

it("launchHarness with a modelId resolves a proxied launch and stores the modelId", async () => {
  // config has models: [{ id: "mdl_x", providerId: "openai", providerModel: "gpt-4o" }]
  await handlers.launchHarness({ id: "claude" as HarnessId, modelId: "mdl_x" as ModelId })
  // assert: resolveLaunch was called with route { kind:"proxied", modelId:"mdl_x" }
  //         terminal.launch received the rendered proxy env + modelId on the session
})

it("launchHarness without a modelId launches in direct (bypass) mode with no proxy env", async () => {
  await handlers.launchHarness({ id: "claude" as HarnessId })
  // assert: resolveLaunch called with route { kind:"direct" }
  //         terminal.launch received NO proxy env; session stored with modelId undefined
})
```

Adjust to the real test doubles in the file (the existing tests already stub `ctx.resolveLaunch`, `ctx.terminal.launch`, `ctx.config`). Mirror their assertion style.

- [ ] **Step 2: Run it (RED).** `bun test apps/desktop/src/gui/ipc/handlers.test.ts` → FAIL.

- [ ] **Step 3: Update the Aliases handler block (handlers.ts:128–163).** Replace with Models handlers:

```ts
    // ── Models ───────────────────────────────────────────────────────────────────────────
    getModels: async () => {
      const config = await loadConfig()
      return config.models
    },

    addModel: async (input) => {
      const config = await loadConfig()
      const model: ModelRoute = {
        id: `mdl_${crypto.randomUUID()}` as ModelRoute["id"],
        providerId: input.providerId,
        providerModel: input.providerModel,
      }
      const saved = await ctx.config.save({
        ...config,
        models: [...config.models, model],
      })
      if (!isOk(saved)) return fail("could not save model")
      return model
    },

    updateModel: async ({ id, input }) => {
      const config = await loadConfig()
      const next: ModelRoute = {
        id,
        providerId: input.providerId,
        providerModel: input.providerModel,
      }
      const models = config.models.map((m) => (m.id === id ? next : m))
      const saved = await ctx.config.save({ ...config, models })
      if (!isOk(saved)) return fail("could not update model")
      return next
    },

    deleteModel: async ({ id }) => {
      const config = await loadConfig()
      const models = config.models.filter((m) => m.id !== id)
      const saved = await ctx.config.save({ ...config, models })
      if (!isOk(saved)) return fail("could not delete model")
      return null
    },
```

Add `ModelRoute` (and `ModelId` if needed) to the `@launchkit/types` import at the top.

- [ ] **Step 4: Update `launchHarness` (handlers.ts:197–238).** Replace alias resolution with routed/bypass. The proxy key + url are only needed in proxied mode:

```ts
    launchHarness: async ({ id, modelId, name, cwd, env }) => {
      const config = await loadConfig()
      const listed = await ctx.registry.list()
      if (!isOk(listed)) return fail("could not list harnesses")
      const harness = listed.value.find((h) => h.id === id)
      if (harness === undefined) return fail(`unknown harness: ${String(id)}`)

      // modelId present → route through the proxy; absent → "default" = bypass the proxy.
      let route: import("@launchkit/harnesses").LaunchRoute
      if (modelId === undefined) {
        route = { kind: "direct" }
      } else {
        const proxyUrl = `http://${config.settings.proxyHost}:${config.settings.proxyPort}`
        const proxyKey = (await ctx.runtime.readProxyKey()) ?? ctx.genProxyKey()
        route = { kind: "proxied", proxyUrl, proxyKey, modelId }
      }

      const resolved = ctx.resolveLaunch({ harness, route })
      if (!isOk(resolved)) return fail("failed to resolve harness launch")

      const safeName = name?.trim() ? name : undefined
      const safeCwd = cwd?.trim() ? cwd : undefined

      const opened = ctx.terminal.launch({
        harnessId: harness.id,
        ...(modelId === undefined ? {} : { modelId }),
        command: resolved.value.command,
        args: resolved.value.args,
        env: { ...resolved.value.env, ...(env ?? {}) },
        ...(safeName === undefined ? {} : { name: safeName }),
        ...(safeCwd === undefined ? {} : { cwd: safeCwd }),
      })
      if (!isOk(opened)) return fail("failed to launch harness")
      return { sessionId: opened.value.sessionId }
    },
```

**Note:** `ctx.resolveLaunch`'s signature must change from `{ harness, proxyUrl, proxyKey, model }` to `{ harness, route }`. Update its type in `apps/desktop/src/composition.ts` (it wraps `resolveHarnessLaunch`) and the terminal manager's `launch` input (`alias` → optional `modelId`). Trace and update:

```bash
grep -rn "resolveLaunch\|alias:" apps/desktop/src --include=*.ts | grep -v test
```

The terminal manager (which creates the Session) must pass `modelId` through to `sessions.create({ harnessId, modelId? })`.

- [ ] **Step 5: Update the tray to bypass-launch.** In `tray.ts` (lines ~72, 78) the quick-launch used `model: harness.defaultAlias` / `alias: harness.defaultAlias`. A tray quick-launch is now a **default** launch: pass `route: { kind: "direct" }` to `resolveLaunch` and omit `modelId` on the terminal launch. Update `tray-menu.ts` if it carries an alias in its descriptor (remove it). Run `grep -n "alias\|defaultAlias\|model:" apps/desktop/src/gui/tray.ts apps/desktop/src/gui/tray-menu.ts`.

- [ ] **Step 6: Update tray/tray-menu tests** to drop alias/defaultAlias expectations and assert a direct-mode launch.

- [ ] **Step 7: Run the desktop main tests (GREEN).** `bun test apps/desktop/src/gui` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add apps/desktop/src
git commit -m "desktop: model CRUD handlers, routed/bypass launch, tray default-launch"
```

---

## Task 8: cli — model add/remove + resolveModel

**Files:**
- Modify: `packages/cli/src/mutate-command.ts`, `packages/cli/src/launch-command.ts`, and `CliDeps`/`deps.ts` if the launch dep signature changes
- Test: `packages/cli/src/mutate-command.test.ts`, `launch-command.test.ts`, `launch-profile.test.ts`, `list.test.ts`

- [ ] **Step 1: Write CLI tests (RED).** In `mutate-command.test.ts`, convert `add alias` / `remove alias` cases to `add model` / `remove model`:

```ts
it("add model --provider openai --model gpt-4o mints a model entry", async () => {
  const deps = makeDeps({ providers: [/* openai */] })
  const r = await add(deps, ["model"], { provider: "openai", model: "gpt-4o" })
  expect(isOk(r)).toBe(true)
  const saved = deps.config.saved() // however the fake exposes the last save
  expect(saved.models).toHaveLength(1)
  expect(saved.models[0].providerModel).toBe("gpt-4o")
  expect(String(saved.models[0].id)).toMatch(/^mdl_/)
})

it("remove model <id> deletes by id", async () => {
  const deps = makeDeps({ models: [{ id: "mdl_x", providerId: "openai", providerModel: "gpt-4o" }] })
  const r = await remove(deps, ["model", "mdl_x"])
  expect(isOk(r)).toBe(true)
  expect(deps.config.saved().models).toHaveLength(0)
})
```

In `launch-command.test.ts` / `launch-profile.test.ts`, assert:

```ts
it("launch with --model <id> routes proxied", async () => {
  // deps.launch should receive route { kind:"proxied", modelId:"mdl_x" }
})
it("launch with no --model and no profile model launches direct (bypass)", async () => {
  // deps.launch should receive route { kind:"direct" }; no proxy started/needed
})
```

- [ ] **Step 2: Run them (RED).** `bun test packages/cli` → FAIL.

- [ ] **Step 3: Update `mutate-command.ts`.** Replace `addAlias`/`removeAlias` with `addModel`/`removeModel` and rewire the `add`/`remove` switches. The CLI mints the id (no `crypto` import needed in a pure command — generate via an injected id source if one exists on `CliDeps`; otherwise use `crypto.randomUUID()` which the codebase already uses inline in handlers). Use `crypto.randomUUID()` for parity:

```ts
import {
  ModelRouteSchema,
  type ModelRoute,
  ProfileSchema,
  // ...keep Profile/Provider/Sdk imports; drop ModelAlias*
} from "@launchkit/types"

const addModel = async (
  deps: CliDeps,
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const provider = requireFlag(flags, "provider")
  if (isErr(provider)) return provider
  const model = requireFlag(flags, "model")
  if (isErr(model)) return model

  const candidate = ModelRouteSchema.safeParse({
    id: `mdl_${crypto.randomUUID()}`,
    providerId: provider.value,
    providerModel: model.value,
  })
  if (!candidate.success) {
    return err({ kind: "usage", detail: candidate.error.message })
  }
  const route: ModelRoute = candidate.data
  return saveOrFail(deps, { ...config, models: [...config.models, route] })
}

const removeModel = async (
  deps: CliDeps,
  config: Config,
  id: string | undefined,
): Promise<Result<void, CliError>> => {
  if (id === undefined) return err({ kind: "usage", detail: "remove model <id>" })
  const next = config.models.filter((m) => m.id !== id)
  if (next.length === config.models.length) {
    return err({ kind: "failed", detail: `unknown model: ${id}` })
  }
  return saveOrFail(deps, { ...config, models: next })
}
```

`addProfile` here used `alias: model.value` — change to `modelId: model.value` so a profile stores a model id:

```ts
  const candidate = ProfileSchema.safeParse({
    id: id.value,
    name: name.value,
    harnessId: harness.value,
    modelId: model.value,
    env: splitEnv(flags),
  })
```

Update the `add`/`remove` switches: `case "alias":` → `case "model":` (call `addModel`/`removeModel`); update the usage strings to `add <provider|model|profile> --…` and `remove <provider|model|profile> <id>`.

- [ ] **Step 4: Update `launch-command.ts`.** Replace `resolveAlias` with `resolveModel` returning an optional id, and drive a routed/direct launch. Remove the `harness.defaultAlias` fallback and the `AliasName*` imports:

```ts
import {
  type HarnessDefinition,
  type ModelId,
  ModelIdSchema,
  type Profile,
} from "@launchkit/types"

/** Resolve the model id: `--model` wins, then the profile's modelId; absent ⇒ default (bypass). */
const resolveModel = (
  profile: Profile | undefined,
  flags: Readonly<Record<string, string | boolean>>,
): ModelId | undefined => {
  const flag = flags.model
  if (typeof flag === "string") return ModelIdSchema.parse(flag)
  return profile?.modelId
}
```

In `launchCommand`, replace `const alias = resolveAlias(...)` with `const modelId = resolveModel(profile, flags)`. When `modelId === undefined`, do **not** start/ensure a proxy (bypass); call `deps.launch({ harness, route: { kind: "direct" }, env, ...cwd })`. When defined, keep the proxy-ensure block and call `deps.launch({ harness, route: { kind: "proxied", proxyUrl, proxyKey, modelId }, env, ...cwd })`. Record the session with `...(modelId !== undefined ? { modelId } : {})`. Update the `deps.launch` (`CliDeps`) type to take `LaunchParams` (the new `{ harness, route, cwd?, env? }`) — it already wraps `launchHarness`/`resolveHarnessLaunch`. Update the usage string to `launch <harnessId> [--model <id>]`.

- [ ] **Step 5: Update `list.ts` / `list.test.ts`** if list output references aliases — `grep -n "alias" packages/cli/src/list.ts` and switch to models (id + provider + providerModel), keeping the "never print secrets" rule.

- [ ] **Step 6: Run package tests (GREEN).** `bun test packages/cli` → PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/cli
git commit -m "cli: model add/remove, resolveModel + direct/proxied launch"
```

---

## Task 9: ui — ModelRow, ModelTable, NewSessionModal picker, HarnessForm

**Files:**
- Rename: `packages/ui/src/molecules/AliasRow.tsx`→`ModelRow.tsx` (+ test), `organisms/AliasTable.tsx`→`ModelTable.tsx` (+ test)
- Modify: `packages/ui/src/organisms/NewSessionModal.tsx` (+ test), `organisms/HarnessForm.tsx` (+ test), molecule/organism/package barrels
- Test: co-located `*.test.tsx`

- [ ] **Step 1: Write the NewSessionModal default-option test (RED).** Add to `NewSessionModal.test.tsx`:

```tsx
it("offers a 'default' model option and can launch with it selected even when no models exist", () => {
  const onSubmit = mock(() => {})
  render(
    <NewSessionModal
      open
      profiles={[]}
      harnesses={[{ id: "claude", name: "Claude Code" /* ...rest */ } as HarnessDefinition]}
      models={[]}
      folder="/tmp"
      onBrowse={() => {}}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  )
  // The picker shows a "default" option and Launch is enabled with it.
  expect(screen.getByText("default")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Launch" }))
  expect(onSubmit).toHaveBeenCalledTimes(1)
  // default selection => no modelId in the emitted values
  expect(onSubmit.mock.calls[0][0].modelId).toBeUndefined()
})

it("lists each configured model as 'provider / model' and emits its id on launch", () => {
  const onSubmit = mock(() => {})
  render(
    <NewSessionModal
      open
      profiles={[]}
      harnesses={[{ id: "claude", name: "Claude Code" } as HarnessDefinition]}
      models={[{ id: "mdl_x", providerId: "openai", providerModel: "gpt-4o" } as ModelRoute]}
      providerNames={{ openai: "OpenAI" }}
      folder="/tmp"
      onBrowse={() => {}}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  )
  fireEvent.change(screen.getByLabelText("Model"), { target: { value: "mdl_x" } })
  fireEvent.click(screen.getByRole("button", { name: "Launch" }))
  expect(onSubmit.mock.calls[0][0].modelId).toBe("mdl_x")
})
```

(Match the file's existing render/query helpers — it already imports from the test utils.)

- [ ] **Step 2: Run it (RED).** `bun test packages/ui/src/organisms/NewSessionModal.test.tsx` → FAIL.

- [ ] **Step 3: Rewrite `NewSessionModal.tsx`.** Key changes: props `aliases: ModelAlias[]` → `models: ModelRoute[]` (+ optional `providerNames?: Record<string,string>`); state `alias: AliasName` → `modelId: ModelId | ""` (`""` = default); picker labeled **"Model"** with a leading `{ value: "", label: "default" }` option then each model as `provider / model`; remove the `noAliases` alert and the alias-gated `canLaunch` (launch only needs a harness now); `submit()` emits `modelId` only when non-empty; `selectProfile` sets `modelId: profile.modelId ?? ""`. New types:

```tsx
import type { HarnessDefinition, HarnessId, ModelId, ModelRoute, Profile } from "@launchkit/types"

export type NewSessionValues = {
  readonly name: string
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  readonly env: Record<string, string>
  readonly saveAsProfile?: { readonly name: string }
}

export type NewSessionModalProps = {
  readonly open: boolean
  readonly profiles: readonly Profile[]
  readonly harnesses: readonly HarnessDefinition[]
  readonly models: readonly ModelRoute[]
  readonly providerNames?: Readonly<Record<string, string>>
  readonly folder: string
  readonly onBrowse: () => void
  readonly onSubmit: (values: NewSessionValues) => void
  readonly onCancel: () => void
  readonly error?: string
}
```

Options + label + submit:

```tsx
  const modelLabel = (m: ModelRoute): string =>
    `${providerNames?.[String(m.providerId)] ?? String(m.providerId)} / ${m.providerModel}`
  const modelOptions = [
    { value: "", label: "default" },
    ...models.map((m) => ({ value: String(m.id), label: modelLabel(m) })),
  ]

  const submit = (): void => {
    const values: NewSessionValues = {
      name: "Untitled",
      cwd: state.cwd,
      harnessId: state.harnessId,
      ...(state.modelId !== "" ? { modelId: state.modelId as ModelId } : {}),
      env: state.env,
      ...(state.save ? { saveAsProfile: { name: state.saveName } } : {}),
    }
    onSubmit(values)
  }

  const canLaunch = state.harnessId !== ""
```

Replace the `session-alias` FormField with:

```tsx
        <FormField id="session-model" label="Model">
          <Select
            id="session-model"
            value={state.modelId === "" ? "" : String(state.modelId)}
            options={modelOptions}
            onChange={(v) => update("modelId", (v === "" ? "" : v) as FormState["modelId"])}
          />
        </FormField>
```

Update `FormState` (`alias` → `modelId: ModelId | ""`) and the reset/effect blocks accordingly (initial `modelId: ""`).

- [ ] **Step 4: Rename AliasRow → ModelRow.**

```bash
git mv packages/ui/src/molecules/AliasRow.tsx packages/ui/src/molecules/ModelRow.tsx
git mv packages/ui/src/molecules/AliasRow.test.tsx packages/ui/src/molecules/ModelRow.test.tsx
```

Rewrite `ModelRow.tsx` props: drop the `alias` column; render `provider` + `model` + Edit/Delete keyed by an `id`:

```tsx
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"

export type ModelRowProps = {
  readonly id: string
  readonly provider: string
  readonly model: string
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
}

export const ModelRow = ({ id, provider, model, onEdit, onDelete }: ModelRowProps): ReactElement => (
  <tr>
    <td>{provider}</td>
    <td>{model}</td>
    <td>
      <Button onClick={() => onEdit(id)}>Edit</Button>
      <Button variant="secondary" onClick={() => onDelete(id)}>Delete</Button>
    </td>
  </tr>
)
```

Update `ModelRow.test.tsx` to the new props (assert provider/model render; onEdit/onDelete fire with `id`).

- [ ] **Step 5: Rename AliasTable → ModelTable.**

```bash
git mv packages/ui/src/organisms/AliasTable.tsx packages/ui/src/organisms/ModelTable.tsx
git mv packages/ui/src/organisms/AliasTable.test.tsx packages/ui/src/organisms/ModelTable.test.tsx
```

Rewrite columns to **Provider, Model, Actions** (no Alias column); props take `models: ModelRoute[]` + `providerNames: Record<string,string>` + `onEdit(id)`/`onDelete(id)`; render a `ModelRow` per model keyed by `model.id`. Update its test fixtures and the column-header assertions.

- [ ] **Step 6: Remove the default-alias field from `HarnessForm.tsx`.** Drop `defaultAlias` from the form's value type (line 13), and remove the `FormField id="harness-alias" label="Default alias"` block (lines ~72–77). Update `HarnessForm.test.tsx` to drop any `defaultAlias` interaction/assertion.

- [ ] **Step 7: Update barrels.** `molecules/index.ts`: `AliasRow`→`ModelRow`. `organisms/index.ts`: `AliasTable`→`ModelTable`. Package `src/index.ts`: same renames. Run `grep -rn "Alias" packages/ui/src/*/index.ts packages/ui/src/index.ts` and fix.

- [ ] **Step 8: Run package tests (GREEN).** `bun test packages/ui` → PASS.

- [ ] **Step 9: Commit.**

```bash
git add packages/ui
git commit -m "ui: ModelRow/ModelTable, NewSessionModal Model picker w/ default, drop HarnessForm default-alias"
```

---

## Task 10: desktop views — ModelsPage, useModels, nav label, HarnessesPage

**Files:**
- Rename: `apps/desktop/views/main/pages/RoutingPage.tsx`→`ModelsPage.tsx` (+ test), `hooks/useAliases.ts`→`useModels.ts`
- Modify: `apps/desktop/views/main/views/SettingsView.tsx`, `pages/HarnessesPage.tsx` (+ test), and wherever `RoutingPage`/`useAliases`/NewSessionModal are wired (the page that renders the modal must pass `models`/`providerNames` and map `onSubmit.modelId` into `launchHarness`)
- Test: co-located `*.test.tsx`

- [ ] **Step 1: Rename the hook.**

```bash
git mv apps/desktop/views/main/hooks/useAliases.ts apps/desktop/views/main/hooks/useModels.ts
```

Rewrite it to call `client.getModels()` and return `ModelRoute[]` (mirror the old hook's shape — loading/error/data + a refresh). Update the symbol name to `useModels`.

- [ ] **Step 2: Rename the page + convert its test (RED).**

```bash
git mv apps/desktop/views/main/pages/RoutingPage.tsx apps/desktop/views/main/pages/ModelsPage.tsx
git mv apps/desktop/views/main/pages/RoutingPage.test.tsx apps/desktop/views/main/pages/ModelsPage.test.tsx
```

In `ModelsPage.test.tsx`: heading "Models"; button "Add model"; add flow calls `client.addModel({ providerId, providerModel })` (no alias field); edit/delete operate by `id` (`client.updateModel({ id, input })`, `client.deleteModel({ id })`); the table shows provider/model. Convert each existing assertion accordingly.

- [ ] **Step 3: Run it (RED).** `bun test apps/desktop/views/main/pages/ModelsPage.test.tsx` → FAIL.

- [ ] **Step 4: Rewrite `ModelsPage.tsx`.** Rename the component to `ModelsPage`; use `useModels()`; heading **"Models"**, add button **"Add model"**; render `ModelTable` with `models` + `providerNames` (built from `useProviders()`); the add/edit form keeps the Provider select + Model field (the existing `ModelField` discovery sub-component is unchanged) but **drops the alias-name input**; `submitDraft` calls `client.addModel(...)` / `client.updateModel({ id, input })`; `deleteModel` calls `client.deleteModel({ id })`. Keep editing state keyed by `id`.

- [ ] **Step 5: Update `SettingsView.tsx` nav.** Change the routing nav entry label "Routing" → **"Models"** and the route key/id from routing→models; point it at `ModelsPage`. Run `grep -n "Routing\|routing\|Alias" apps/desktop/views/main/views/SettingsView.tsx` and update label + import + render.

- [ ] **Step 6: Update the New Session wiring.** Find the page/view that renders `NewSessionModal` (the session master/detail view) and: pass `models={...}` (from `useModels`) + `providerNames`, drop `aliases`; in its `onSubmit`, call `client.launchHarness({ id: harnessId, ...(modelId ? { modelId } : {}), name, cwd, env })`. Run `grep -rn "NewSessionModal\|aliases=\|useAliases\|\.alias" apps/desktop/views` and fix every site.

- [ ] **Step 7: Update `HarnessesPage.tsx`.** Remove `defaultAlias` from the form defaults (line 19) and the create/update mapping (line 38). Update `HarnessesPage.test.tsx` to drop `defaultAlias`.

- [ ] **Step 8: Sweep for stragglers.** `grep -rn "alias\|Alias\|Routing\|routing" apps/desktop/views packages --include=*.ts --include=*.tsx | grep -v build/ | grep -v node_modules` — resolve every remaining reference (imports, types, labels). None should remain except in the spec/plan docs.

- [ ] **Step 9: Run the view tests (GREEN).** `bun test apps/desktop/views` → PASS.

- [ ] **Step 10: Commit.**

```bash
git add apps/desktop/views
git commit -m "desktop views: ModelsPage + useModels, Models nav, wire default model picker"
```

---

## Task 11: Integration gate — full typecheck, lint, tests + PROGRESS

**Files:** none new — this is the whole-monorepo verification the Definition of Done requires.

- [ ] **Step 1: Full typecheck.** `bun run typecheck` → must be GREEN. Fix any remaining `alias`/`defaultAlias`/`AliasName` references the per-package sweeps missed (the root rename surfaces them here). Re-run until clean.

- [ ] **Step 2: Lint.** `bun run lint` → GREEN (no `any`, explicit types, no deep imports). Fix and re-run.

- [ ] **Step 3: Full test suite.** `bun test` → all GREEN.

- [ ] **Step 4: Smoke the GUI per the project memory.** Build + launch and verify the app actually runs (not just that it builds): follow `MANUAL-VERIFICATION.md` / `smoke.sh`. Confirm the Settings nav shows **Models**, "Add model" works, and the New Session modal's **Model** picker shows **default** + configured models. (See memory: "build-passing ≠ app-runs".)

- [ ] **Step 5: Update the ledger.** Update `build-plan/PROGRESS.md` per `build-plan/EXECUTION.md` (entry for this refactor with the final commit SHA).

- [ ] **Step 6: Final commit.**

```bash
git add build-plan/PROGRESS.md
git commit -m "models-rename: full typecheck/lint/test green; update PROGRESS"
```

---

## Self-review notes (author)

- **Spec coverage:** page rename (T10), "Add model" (T10/T9), alias→id (T1), Model picker (T9), default=bypass (T4 launch + T7/T8 callers), migration (T2 config + T5 sessions), `defaultAlias` removal (T1/T4/T7/T8/T9/T10), IPC/CLI surface (T6/T8), proxy by id (T3). All covered.
- **Type consistency:** `ModelRoute`/`ModelId`/`config.models`/`Session.modelId`/`Profile.modelId`/`LaunchRoute{proxied|direct}`/`unknown-model` used identically across tasks. `addModel` params are `{ providerId, providerModel }` in both IPC (T6) and handler (T7); CLI mints `mdl_${crypto.randomUUID()}` (T8) matching the handler (T7).
- **Known cross-package break:** full `typecheck` is RED until Task 11 by design (documented up top); each task gates on its own package's `bun test`.
