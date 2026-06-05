# Design: "Routing/Alias" → "Models"

**Date:** 2026-06-05
**Status:** Approved (brainstorming) — ready for implementation plan

## Problem

The "Routing" concept and its "Alias" entity are confusing. An alias is a
user-named handle that maps to a provider + model, and that name doubles as the
identifier passed through the proxy. Users don't think in terms of "routing
aliases" — they think in terms of "which models are available to pick when I
start a session."

## Goal

Reframe the whole concept around **Models**:

- The "Routing" page becomes the **"Models"** page.
- "Add Alias" becomes **"Add model"**.
- The user-facing alias **name is removed**; entries are told apart by an opaque,
  server-generated **unique id**. The UI shows each entry as `provider / model`.
- The "New session" modal's **Alias picker becomes a Model picker**.
- The Model picker **always offers a "default" option** that uses the harness's
  own native model **instead of routing through the proxy** (i.e. it **bypasses
  the proxy entirely** — the harness runs with its own credentials/model and
  LaunchKit does no routing for that session).

## Key decisions (locked during brainstorming)

1. **"default" = bypass the proxy entirely.** No proxy env is injected; the
   harness talks directly to its native backend with its own credentials.
2. **Identity = generated opaque id**, shown in UI as `provider / model`. No
   user-facing name field at all.
3. **Auto-migrate** existing persisted state (config + profiles) via a forward
   config migration; historical sessions are read tolerantly (shown as
   "default").
4. **Naming:** the type is `ModelRoute`, the config array is `config.models`, the
   branded id is `ModelId`.

## Data model changes

### types package

`packages/types/src/alias.ts` → `packages/types/src/model-route.ts`:

```ts
ModelRouteSchema = z.object({
  id: ModelIdSchema,
  providerId: ProviderIdSchema,
  providerModel: z.string().min(1),
}).strict()
export type ModelRoute = z.infer<typeof ModelRouteSchema>
```

`packages/types/src/ids.ts`:

- Add `ModelIdSchema = z.string().min(1).brand<"ModelId">()` / `ModelId`.
- **Remove** `AliasNameSchema` / `AliasName`.

`packages/types/src/harness.ts`:

- **Remove** `defaultAlias` field. "default" is now a universal picker option,
  not a per-harness setting.

`packages/types/src/session.ts`:

- `alias: AliasNameSchema` → `modelId: ModelIdSchema.optional()`.
  Absent ⇒ the session was launched with **default** (bypass).

`packages/types/src/profile.ts`:

- `alias: AliasNameSchema` → `modelId: ModelIdSchema.optional()`.
  Absent ⇒ profile launches with **default**.

Barrel `src/index.ts`: export `ModelRouteSchema`/`ModelRoute`/`ModelIdSchema`/
`ModelId`; drop `ModelAliasSchema`/`ModelAlias`/`AliasNameSchema`/`AliasName`.

### config package

`packages/config/src/schema.ts`:

- `aliases: z.array(ModelAliasSchema)` → `models: z.array(ModelRouteSchema)`.
- `defaultConfig()`: `aliases: []` → `models: []`.
- Bump `CURRENT_CONFIG_VERSION` 3 → 4.

### proxy package

`packages/proxy/src/types.ts`:

- `ProxyError` kind `{ kind:"unknown-alias", alias }` →
  `{ kind:"unknown-model", id }`.

`packages/proxy/src/router.ts`:

- Build the lookup map keyed by `route.id` (was `alias.alias`).
- `resolve(id)` returns the matching `ModelRoute`'s provider + `providerModel`,
  or `{ kind:"unknown-model", id }`.

`packages/proxy/src/handler.ts`:

- Unchanged in shape: the inbound request's `model` field now carries a
  `ModelId`. Only the error mapping for `unknown-model` changes.

## Launch behavior

`packages/harnesses/src/launch.ts` — refactor `LaunchParams` to a discriminated
launch mode:

```ts
type LaunchRoute =
  | { kind: "proxied"; proxyUrl: string; proxyKey: string; modelId: ModelId }
  | { kind: "direct" } // bypass

interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly route: LaunchRoute
}
```

`resolveHarnessLaunch`:

- `route.kind === "proxied"`: render `envTemplate` with
  `{ proxyUrl, proxyKey, model: String(modelId) }` (today's behavior), still
  validating the template tokens.
- `route.kind === "direct"`: **skip `envTemplate` rendering entirely**. Resolve
  the command, env = caller-supplied env only. The harness uses its own native
  credentials/model; the proxy is not involved.

In both modes the command is resolved + validated identically (rejects
relative/`..`), and `params.env` still wins over any rendered env.

## Migration (config v3 → v4)

Add a forward migration in `packages/config/src/migrations.ts`:

- `aliases[]` → `models[]`: for each old alias, `id = <old alias string>`
  (already unique within a config, so profile references map without lookups),
  preserving `providerId` and `providerModel`.
- `profiles[].alias` → `profiles[].modelId` (same string value).
- Drop `defaultAlias` from any user harness JSON encountered (built-ins simply
  lose the field in code).

**Sessions** (historical, persisted by the sessions store): `modelId` is
optional; the session read path strips a legacy `alias` key before
`SessionSchema` parse (schema is `.strict()`), so old sessions deserialize with
`modelId` absent and display as **default**.

## IPC surface

`packages/ipc/src/methods.ts`:

- `getAliases` → `getModels` → `ModelRoute[]`
- `addAlias` → `addModel`; params `{ providerId, providerModel }` (server mints
  `id`); result `ModelRoute`
- `updateAlias` → `updateModel`; params `{ id, input: { providerId, providerModel } }`
- `deleteAlias` → `deleteModel`; params `{ id: ModelId }`
- `launchHarness`: param `alias?: AliasName` → `modelId?: ModelId`
  (absent ⇒ default/bypass)

`apps/desktop/src/gui/ipc/handlers.ts`:

- `getModels` returns `config.models`.
- `addModel` generates a fresh opaque id (via an injected id/random adapter),
  appends, persists, returns the created `ModelRoute`.
- `updateModel`/`deleteModel` operate by `id`.
- `launchHarness`: if `modelId` present → resolve a `proxied` launch route
  (mint/read proxy key as today) and store `modelId` on the session; if absent →
  resolve a `direct` (bypass) launch route and store the session with `modelId`
  absent. Remove the `harness.defaultAlias` fallback.

## CLI surface

`packages/cli/src/mutate-command.ts`:

- `alias add/remove` → `model add/remove`. `model add` mints an id; `model
  remove` takes an id.

`packages/cli/src/launch-command.ts`:

- `resolveAlias` → `resolveModel`: `--model <id>` selects a route by id; when
  the flag is absent and the profile has no `modelId`, the launch is **default**
  (bypass). Remove the `harness.defaultAlias` fallback.

`packages/cli/src/list.ts` (and any list output): reference models/ids instead of
aliases.

## GUI

`apps/desktop/views/main/pages/RoutingPage.tsx` → `ModelsPage.tsx`:

- Nav/section label "Routing" → **"Models"**; button "Add Alias" → **"Add
  model"**. Form has Provider select + Model field (model discovery unchanged);
  no alias-name input.

`apps/desktop/views/main/views/SettingsView.tsx`: rename the routing nav entry to
"Models".

`packages/ui/src/organisms/AliasTable.tsx` → `ModelTable.tsx` and
`packages/ui/src/molecules/AliasRow.tsx` → `ModelRow.tsx`:

- Columns: **Provider, Model, Actions** (no Alias column). Rows keyed by id.

`packages/ui/src/organisms/NewSessionModal.tsx`:

- Alias picker → **Model picker**. First option is always **"default"** (value =
  no `modelId`); remaining options are each configured model rendered as
  `provider / model`. Launch is enabled with "default" selected even when no
  models are configured (the "no aliases configured" error path is removed —
  default always works).

`apps/desktop/views/main/hooks/useAliases.ts` → `useModels.ts`.

## Testing (TDD, RED → GREEN → REFACTOR throughout)

Existing alias tests are converted to model tests; new behavior gets new RED
tests first:

- types: `model-route.test.ts` (valid parse, rejects empty `providerModel`);
  session/profile optional `modelId`; harness no longer has `defaultAlias`.
- config: schema `models`; **new** migration v3→v4 test (aliases→models with id =
  old name, profile alias→modelId, defaultAlias dropped).
- proxy: router resolves by id; `unknown-model` error; `unknown-provider`
  unchanged.
- harnesses: `launch.test.ts` — **proxied** mode renders env (existing),
  **direct** mode skips envTemplate and injects no proxy vars (new).
- ipc: method schemas for `getModels/addModel/updateModel/deleteModel` and
  `launchHarness` `modelId`.
- desktop handlers: `addModel` mints id + persists; routed launch stores
  `modelId` + proxied env; default launch bypasses (no proxy env) + stores
  session with `modelId` absent.
- cli: `model add/remove`; `resolveModel` (flag / profile / default-bypass).
- ui: `ModelRow`/`ModelTable` render provider+model; `ModelsPage` add/edit/delete
  by id; `NewSessionModal` default option present + launch with default selected.

## Build order (dependency-respecting)

1. `types` (ids, model-route, harness, session, profile, barrel)
2. `config` (schema + migration) and `proxy` (router/types/handler) and
   `harnesses` (launch bypass) — independent of each other, all depend on types
3. `ipc` (methods)
4. `cli` and `apps/desktop` handlers and `ui` components — depend on the above

Each step is its own task: test-first (RED observed) → GREEN → refactor →
`bun run typecheck && bun run lint && bun test` green → update `PROGRESS.md` →
commit with the task id.

## Out of scope / YAGNI

- No optional user-facing label/name for models (explicitly removed).
- No per-harness default model (removed `defaultAlias`; default = universal
  bypass).
- No proxy "pass-through to a designated provider" mode (default is a clean
  bypass, not a transparent proxy).
