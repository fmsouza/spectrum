# Session-centric master/detail redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the LaunchKit GUI into a session-centric master/detail workspace — a vertical, paginated session list as the master and the selected session's terminal as the detail — move all configuration behind a Settings toggle, and add launch presets ("profiles"), session `name`/`cwd`, durable file-based scrollback, and matching CLI parity.

**Architecture:** Changes flow strictly along the package dependency chain `types → {config, sessions, pty, harnesses, ipc} → {ui, cli} → apps/desktop`. All effects (fs, spawn, native dialog) stay behind injected adapter interfaces with in-memory fakes; the GUI is atomic-design React where data enters at the view level via hooks over a typed IPC client. Durable scrollback is a new file-based `ScrollbackStore` tapped off the existing PTY byte stream; profiles are stored in the config file; the native folder picker uses Electrobun's `Utils.openFileDialog` behind a lazy-import seam.

**Tech Stack:** Bun + TypeScript (strict, no `any`), `bun test` (Jest API), zod, React + happy-dom + @testing-library/react, `bun:sqlite`, Electrobun, `@launchkit/*` workspaces.

**Spec:** `docs/superpowers/specs/2026-06-04-session-master-detail-redesign-design.md`

---

## How to execute

Implement **phases in order** (1 → 7). Each task is RED → GREEN → REFACTOR → commit. Run the per-task `bun test <file>` for the tight loop; run the full gate (`bun run typecheck && bun run lint && bun test`) at each **Phase gate** line before moving to the next phase.

Task IDs are phase-prefixed so they never collide:

| Phase | Prefix | Package(s) | Depends on |
|---|---|---|---|
| 1 | `T` | `@launchkit/types` | — |
| 2 | `CS` | `@launchkit/config`, `@launchkit/sessions` | 1 |
| 3 | `PH` | `@launchkit/pty`, `@launchkit/harnesses` | 1, 2 |
| 4 | `I` | `@launchkit/ipc` | 1 |
| 5 | `C` | `@launchkit/cli` | 1, 2, 3 |
| 6 | `U` | `@launchkit/ui` | 1 |
| 7 | `D` | `apps/desktop` | 1–6 |

**Expected during execution:** a later phase's RED step may *fail to compile* (not just fail an assertion) until the phase it depends on has landed — e.g. phase 4/6/7 reference `Profile`/`ProfileSchema` and the new UI components. That is the intended RED signal; execute phases in dependency order and it resolves.

## Progress tracking

Per the repo's Definition of Done, `build-plan/PROGRESS.md` is the source of truth for build state. **Task 0** adds a tracking section for this feature; check off rows (with commit SHAs) as tasks land; **Task FINAL** closes it out with the whole-repo gate + runtime verification.

---

## Task 0: Add the feature's PROGRESS.md tracking section

**Files:**
- Modify: `build-plan/PROGRESS.md`

- [ ] **Step 1: Add a tracking section** — append a new section under the existing status entries in `build-plan/PROGRESS.md`:

```markdown
### Session-centric master/detail redesign (2026-06-04) — `[session-redesign]`

Spec: `docs/superpowers/specs/2026-06-04-session-master-detail-redesign-design.md`.
Plan: `docs/superpowers/plans/2026-06-04-session-master-detail-redesign.md`.
Reworks the GUI into a session-first master/detail workspace (vertical paginated session
list + click-to-open terminal detail), moves config behind a Settings toggle, and adds
launch presets (profiles), session name/cwd, file-based scrollback persistence, and CLI parity.

| ID | Task | Status | Commit |
|---|---|---|---|
| T.* | types: Profile + Session name/cwd | todo | |
| CS.* | config profiles + migration; sessions name/cwd + pagination | todo | |
| PH.* | pty scrollback store + cwd/name; harnesses cwd/env | todo | |
| I.* | ipc: profiles/pickFolder/scrollback + launch/getSessions params | todo | |
| C.* | cli: profiles CRUD + launch --profile/--name/--cwd | todo | |
| U.* | ui: Modal/SessionList/NewSessionModal/AppShell rework + more | todo | |
| D.* | desktop: handlers, composition, app.tsx master/detail, replay | todo | |
| FINAL | whole-repo gate + runtime verification | todo | |
```

- [ ] **Step 2: Commit**

```bash
git add build-plan/PROGRESS.md && git commit -m "docs(progress): track session-redesign feature (Task 0)"
```

---
## Phase 1 — `@launchkit/types`: `Profile` type + `ProfileId`, and `name`/`cwd` on `Session`

**Scope:** `packages/types/src`. Add a `ProfileId` branded id, a new `Profile` domain type (schema + inferred type), extend `Session` with optional `name`/`cwd`, and export the new symbols from the barrel. All work is TDD (RED → GREEN → REFACTOR) using `bun test` (Jest API via `bun:test`).

**Conventions locked from existing code (mirror exactly):**
- Test files import `{ describe, expect, it } from "bun:test"` and are colocated as `*.test.ts`.
- Branded ids are `z.string().min(1).brand<"X">()` with a paired `export type X = z.infer<typeof XSchema>`; assert in tests with `.toBe<string>("...")`.
- Object schemas end in `.strict()`; string-maps use `z.record(z.string(), z.string())`.
- Test fixtures are plain objects with unbranded `string` values that the schema parses.

---

### Task T.1: Add `ProfileIdSchema` / `ProfileId` branded id

**Files:**
- Modify: `packages/types/src/ids.ts:13` (insert after the `SessionId` block, before `SecretRefSchema`)
- Test: `packages/types/src/ids.test.ts` (add a new `describe` block)

- [ ] **Step 1: Write the failing test** — append a `ProfileIdSchema` block to the existing `packages/types/src/ids.test.ts`. Add the import and the new `describe`:

```ts
import { describe, expect, it } from "bun:test"
import { ProfileIdSchema, ProviderIdSchema, SecretRefSchema } from "./ids"

describe("ProviderIdSchema", () => {
  it("parses a non-empty string into a branded ProviderId", () => {
    expect(ProviderIdSchema.parse("p_123")).toBe<string>("p_123")
  })
  it("rejects an empty string", () => {
    expect(ProviderIdSchema.safeParse("").success).toBe(false)
  })
})

describe("SecretRefSchema", () => {
  it("parses an object with a non-empty ref", () => {
    expect(SecretRefSchema.parse({ ref: "kc_abc" })).toEqual({ ref: "kc_abc" })
  })
  it("rejects an object containing a raw secret value field", () => {
    expect(
      SecretRefSchema.safeParse({ ref: "kc_abc", value: "sk-xxx" }).success,
    ).toBe(false)
  })
})

describe("ProfileIdSchema", () => {
  it("parses a non-empty string into a branded ProfileId", () => {
    expect(ProfileIdSchema.parse("prof_123")).toBe<string>("prof_123")
  })
  it("rejects an empty string", () => {
    expect(ProfileIdSchema.safeParse("").success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/types/src/ids.test.ts`
  Expected failure: `SyntaxError: Export named 'ProfileIdSchema' not found in module '.../packages/types/src/ids.ts'` (the import binding is undefined because `ProfileIdSchema` is not yet exported).

- [ ] **Step 3: Implement** — in `packages/types/src/ids.ts`, insert the `ProfileId` pair after the `SessionId` block (line 13) and before `SecretRefSchema`. The full file becomes:

```ts
import { z } from "zod"

export const ProviderIdSchema = z.string().min(1).brand<"ProviderId">()
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const AliasNameSchema = z.string().min(1).brand<"AliasName">()
export type AliasName = z.infer<typeof AliasNameSchema>

export const HarnessIdSchema = z.string().min(1).brand<"HarnessId">()
export type HarnessId = z.infer<typeof HarnessIdSchema>

export const SessionIdSchema = z.string().min(1).brand<"SessionId">()
export type SessionId = z.infer<typeof SessionIdSchema>

export const ProfileIdSchema = z.string().min(1).brand<"ProfileId">()
export type ProfileId = z.infer<typeof ProfileIdSchema>

export const SecretRefSchema = z.object({ ref: z.string().min(1) }).strict()
export type SecretRef = z.infer<typeof SecretRefSchema>
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/types/src/ids.test.ts`

- [ ] **Step 5: Commit** — `git add packages/types/src/ids.ts packages/types/src/ids.test.ts && git commit -m "feat(types): add ProfileId branded id (T.1)"`

---

### Task T.2: Add `ProfileSchema` / `Profile` domain type

**Files:**
- Create: `packages/types/src/profile.ts`
- Test: `packages/types/src/profile.test.ts`

- [ ] **Step 1: Write the failing test** — create `packages/types/src/profile.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { ProfileSchema } from "./profile"

const valid = {
  id: "prof_default",
  name: "Default",
  harnessId: "claude",
  alias: "default",
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("ProfileSchema", () => {
  it("parses a valid profile with an env map", () => {
    const parsed = ProfileSchema.parse(valid)
    expect(parsed.id).toBe<string>("prof_default")
    expect(parsed.name).toBe("Default")
    expect(parsed.harnessId).toBe<string>("claude")
    expect(parsed.alias).toBe<string>("default")
    expect(parsed.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })
  })
  it("parses a profile with an empty env map", () => {
    const parsed = ProfileSchema.parse({ ...valid, env: {} })
    expect(parsed.env).toEqual({})
  })
  it("rejects a profile with an empty name", () => {
    expect(ProfileSchema.safeParse({ ...valid, name: "" }).success).toBe(false)
  })
  it("rejects a profile whose env contains a non-string value", () => {
    expect(
      ProfileSchema.safeParse({ ...valid, env: { PORT: 8080 } }).success,
    ).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(ProfileSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/types/src/profile.test.ts`
  Expected failure: `error: Cannot find module './profile' from '.../packages/types/src/profile.test.ts'` (the module file does not exist yet).

- [ ] **Step 3: Implement** — create `packages/types/src/profile.ts`:

```ts
import { z } from "zod"
import { AliasNameSchema, HarnessIdSchema, ProfileIdSchema } from "./ids"

export const ProfileSchema = z
  .object({
    id: ProfileIdSchema,
    name: z.string().min(1),
    harnessId: HarnessIdSchema,
    alias: AliasNameSchema,
    env: z.record(z.string(), z.string()),
  })
  .strict()

export type Profile = z.infer<typeof ProfileSchema>
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/types/src/profile.test.ts`

- [ ] **Step 5: Commit** — `git add packages/types/src/profile.ts packages/types/src/profile.test.ts && git commit -m "feat(types): add Profile schema and type (T.2)"`

---

### Task T.3: Add optional `name`/`cwd` to `SessionSchema`

**Files:**
- Modify: `packages/types/src/session.ts:11` (add two optional fields after `exitCode`, keeping `.strict()`)
- Test: `packages/types/src/session.test.ts` (add a new `it` case)

- [ ] **Step 1: Write the failing test** — add a case for `name`/`cwd` to `packages/types/src/session.test.ts`. The full file becomes:

```ts
import { describe, expect, it } from "bun:test"
import { SessionSchema } from "./session"

const open = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-05-23T10:00:00.000Z",
}

describe("SessionSchema", () => {
  it("parses an open session without endedAt/exitCode", () => {
    const parsed = SessionSchema.parse(open)
    expect(parsed.id).toBe<string>("s_1")
    expect(parsed.harnessId).toBe<string>("claude")
    expect(parsed.alias).toBe<string>("default")
    expect(parsed.startedAt).toBe("2026-05-23T10:00:00.000Z")
  })
  it("parses a closed session with endedAt and exitCode", () => {
    const closed = { ...open, endedAt: "2026-05-23T10:05:00.000Z", exitCode: 0 }
    const parsed = SessionSchema.parse(closed)
    expect(parsed.endedAt).toBe("2026-05-23T10:05:00.000Z")
    expect(parsed.exitCode).toBe(0)
  })
  it("parses a session with an optional name and cwd", () => {
    const named = { ...open, name: "My run", cwd: "/Users/fred/projects/app" }
    const parsed = SessionSchema.parse(named)
    expect(parsed.name).toBe("My run")
    expect(parsed.cwd).toBe("/Users/fred/projects/app")
  })
  it("parses an open session with name and cwd omitted", () => {
    const parsed = SessionSchema.parse(open)
    expect(parsed.name).toBeUndefined()
    expect(parsed.cwd).toBeUndefined()
  })
  it("rejects a startedAt that is not an ISO datetime", () => {
    expect(
      SessionSchema.safeParse({ ...open, startedAt: "yesterday" }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/types/src/session.test.ts`
  Expected failure: the `"parses a session with an optional name and cwd"` case fails — `expect(parsed.name).toBe("My run")` receives `undefined` because `.strict()` strips the unknown `name`/`cwd` keys (and TypeScript reports `Property 'name' does not exist on type 'Session'`).

- [ ] **Step 3: Implement** — in `packages/types/src/session.ts`, add `name` and `cwd` as optional fields after `exitCode`, keeping `.strict()`. The full file becomes:

```ts
import { z } from "zod"
import { AliasNameSchema, HarnessIdSchema, SessionIdSchema } from "./ids"

export const SessionSchema = z
  .object({
    id: SessionIdSchema,
    harnessId: HarnessIdSchema,
    alias: AliasNameSchema,
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
    exitCode: z.number().int().optional(),
    name: z.string().optional(),
    cwd: z.string().optional(),
  })
  .strict()

export type Session = z.infer<typeof SessionSchema>
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/types/src/session.test.ts`

- [ ] **Step 5: Commit** — `git add packages/types/src/session.ts packages/types/src/session.test.ts && git commit -m "feat(types): add optional name and cwd to Session (T.3)"`

---

### Task T.4: Export `Profile` symbols from the barrel

**Files:**
- Modify: `packages/types/src/index.ts:6` (add a `./profile` re-export; `ProfileIdSchema`/`ProfileId` already flow through the existing `./ids` re-export)
- Test: `packages/types/src/index.test.ts` (extend the exported-names list)

- [ ] **Step 1: Write the failing test** — add `ProfileIdSchema` and `ProfileSchema` to the barrel name list in `packages/types/src/index.test.ts`. The full file becomes:

```ts
import { describe, expect, it } from "bun:test"
import * as types from "./index"

describe("@launchkit/types barrel", () => {
  it("exports every schema and enum when imported", () => {
    for (const name of [
      "SdkProviderSchema",
      "ApiFormatSchema",
      "ProviderIdSchema",
      "AliasNameSchema",
      "HarnessIdSchema",
      "SessionIdSchema",
      "ProfileIdSchema",
      "SecretRefSchema",
      "ProviderSchema",
      "ModelAliasSchema",
      "HarnessDefinitionSchema",
      "SessionSchema",
      "ProfileSchema",
    ]) {
      expect(types).toHaveProperty(name)
    }
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/types/src/index.test.ts`
  Expected failure: the assertion fails on `"ProfileSchema"` — `expect(received).toHaveProperty("ProfileSchema")` is `false` because `./profile` is not re-exported from the barrel yet (`ProfileIdSchema` already passes via `./ids`).

- [ ] **Step 3: Implement** — in `packages/types/src/index.ts`, add the `./profile` re-export. The full file becomes:

```ts
export * from "./enums"
export * from "./ids"
export * from "./provider"
export * from "./alias"
export * from "./harness"
export * from "./session"
export * from "./profile"
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/types/src/index.test.ts`

- [ ] **Step 5: Commit** — `git add packages/types/src/index.ts packages/types/src/index.test.ts && git commit -m "feat(types): export Profile from barrel (T.4)"`

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green before the next phase.
## Phase 2 — `@launchkit/config` + `@launchkit/sessions`

Adds a top-level `profiles: Profile[]` to the config document (with a `v2 → v3`
forward migration) and extends session persistence with `name`/`cwd` columns plus
`running`/`limit`/`offset` query filters.

**Prerequisite (earlier phase, assumed DONE):** `@launchkit/types` exports
`Profile` + `ProfileSchema`, and `SessionSchema`/`Session` carry optional
`name?: string` / `cwd?: string`. Every task below imports these names from
`@launchkit/types`; if they are absent the RED steps will fail to compile, which is
the correct signal that the prerequisite phase has not landed.

**Conventions (apply to every task):** TS strict, **no `any`** (narrow via
`Record<string, unknown>`, never `as any`); effects stay behind the injected
`ConfigFile` / `Database` adapters; functions return `Result<T, E>` from
`@launchkit/utils` (`ok`/`err`/`isOk`/`isErr`) and never throw; all SQL is
parameterized (values in the bind array, never interpolated). TDD only — `bun test`
with the Jest API, `*.test.ts` colocated, `it("does X when Y happens")`, RED → GREEN
→ REFACTOR.

---

### Task CS.1: Add `profiles` to the config schema and defaults

Bump `CURRENT_CONFIG_VERSION` 2 → 3, add a required `profiles: z.array(ProfileSchema)`
to `ConfigSchema` (so the inferred `Config` gains `profiles: Profile[]`), and seed
`profiles: []` in `defaultConfig()`. `ConfigSchema` stays `.strict()`, so existing
tests that build a "current" document without `profiles` must be updated to include
it.

**Files:**
- Modify: `packages/config/src/schema.ts:5` (`CURRENT_CONFIG_VERSION`), `:21` (`ConfigSchema`), `:33` (`defaultConfig`)
- Test: `packages/config/src/schema.test.ts`

- [ ] **Step 1: Write the failing test** — append a `profiles` group and repair the two existing literals that omit `profiles` (the `ConfigSchema.parse` round-trip at the top of the `ConfigSchema` block, and both `defaultConfig` expectations). FULL replacement for the affected regions:

  Replace the `import` line at the top of the file:
  ```ts
  import { describe, expect, it } from "bun:test"
  import {
    CURRENT_CONFIG_VERSION,
    ConfigSchema,
    SettingsSchema,
    defaultConfig,
  } from "./schema"
  ```
  with:
  ```ts
  import { describe, expect, it } from "bun:test"
  import {
    CURRENT_CONFIG_VERSION,
    ConfigSchema,
    SettingsSchema,
    defaultConfig,
  } from "./schema"

  const validProfile = {
    id: "pr_default",
    name: "Default",
    harnessId: "claude",
    alias: "fast",
    env: {},
  }
  ```

  Replace the existing `ConfigSchema.parse(config)` round-trip test body:
  ```ts
    it("parses a valid config with one provider, one alias, and settings", () => {
      const config = {
        version: CURRENT_CONFIG_VERSION,
        providers: [validProvider],
        aliases: [
          { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" },
        ],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
      }
      expect(ConfigSchema.parse(config)).toEqual(config)
    })
  ```
  with:
  ```ts
    it("parses a valid config with one provider, one alias, profiles, and settings", () => {
      const config = {
        version: CURRENT_CONFIG_VERSION,
        providers: [validProvider],
        aliases: [
          { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" },
        ],
        profiles: [validProfile],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
      }
      expect(ConfigSchema.parse(config)).toEqual(config)
    })

    it("defaults profiles to an empty array shape and rejects a non-array profiles", () => {
      expect(
        ConfigSchema.safeParse({
          version: CURRENT_CONFIG_VERSION,
          providers: [],
          aliases: [],
          profiles: "nope",
          settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        }).success,
      ).toBe(false)
    })
  ```

  Replace the entire `defaultConfig` describe block:
  ```ts
  describe("defaultConfig", () => {
    it("returns the current version, empty providers/aliases, and loopback defaults", () => {
      expect(defaultConfig()).toEqual({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
      })
    })
    it("produces a config that satisfies ConfigSchema", () => {
      expect(ConfigSchema.safeParse(defaultConfig()).success).toBe(true)
    })
  })
  ```
  with:
  ```ts
  describe("defaultConfig", () => {
    it("returns the current version, empty providers/aliases/profiles, and loopback defaults", () => {
      expect(defaultConfig()).toEqual({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        profiles: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
      })
    })
    it("produces a config that satisfies ConfigSchema", () => {
      expect(ConfigSchema.safeParse(defaultConfig()).success).toBe(true)
    })
    it("uses the bumped CURRENT_CONFIG_VERSION of 3", () => {
      expect(CURRENT_CONFIG_VERSION).toBe(3)
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/config/src/schema.test.ts`. Expected failure: `CURRENT_CONFIG_VERSION` is still `2` (the new assertion fails), and the `defaultConfig()` / `ConfigSchema.parse` equality checks fail because the implementation does not yet emit or require `profiles`.

- [ ] **Step 3: Implement** — replace the whole of `packages/config/src/schema.ts` with:
  ```ts
  import { ModelAliasSchema, ProfileSchema, ProviderSchema } from "@launchkit/types"
  import { z } from "zod"

  /** Bump on any breaking config shape change; add a matching `Migration` (see migrations.ts). */
  export const CURRENT_CONFIG_VERSION = 3

  /**
   * Process-wide settings. `proxyHost` is the literal loopback address — the proxy
   * binds `127.0.0.1` only (security.md), so any other host is rejected at validation.
   */
  export const SettingsSchema = z
    .object({
      proxyPort: z.number().int().min(1).max(65535).default(4000),
      proxyHost: z.literal("127.0.0.1").default("127.0.0.1"),
    })
    .strict()

  export type Settings = z.infer<typeof SettingsSchema>

  /** The on-disk config document. `providers`/`aliases`/`profiles` reuse the locked `@launchkit/types` schemas. */
  export const ConfigSchema = z
    .object({
      version: z.number().int(),
      providers: z.array(ProviderSchema),
      aliases: z.array(ModelAliasSchema),
      profiles: z.array(ProfileSchema),
      settings: SettingsSchema,
    })
    .strict()

  export type Config = z.infer<typeof ConfigSchema>

  /** Factory defaults for a brand-new install — current version, nothing configured, loopback proxy. */
  export const defaultConfig = (): Config => ({
    version: CURRENT_CONFIG_VERSION,
    providers: [],
    aliases: [],
    profiles: [],
    settings: SettingsSchema.parse({}),
  })
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/config/src/schema.test.ts`

- [ ] **Step 5: Commit** — `git add packages/config/src/schema.ts packages/config/src/schema.test.ts && git commit -m "config: add profiles to schema + defaults, bump version to 3 (CS.1)"`

---

### Task CS.2: Add the `v2 → v3` migration

Add `v2ToV3` mirroring the existing `Migration` type and the `v1ToV2` pattern exactly
(narrow `raw` via the existing `asRecord` helper; no `any`). It sets `profiles` to
`raw.profiles` when that is already an array, otherwise `[]`, and stamps `version: 3`.
Register it after `v1ToV2` in the ordered `migrations` list. Because
`CURRENT_CONFIG_VERSION` is now 3, the existing migration tests that build a "current"
document or assert the migration count must be updated.

**Files:**
- Modify: `packages/config/src/migrations.ts:50` (the `migrations` list) — add `v2ToV3` above it
- Test: `packages/config/src/migrations.test.ts`

- [ ] **Step 1: Write the failing test** — update the migration-count expectation, repair the "already-current" literal to include `profiles`, and add a v2→v3 round-trip group.

  Replace the existing `migrations` describe block:
  ```ts
  describe("migrations", () => {
    it("ships exactly one ordered v1->v2 migration", () => {
      expect(migrations).toHaveLength(1)
      expect(migrations[0]?.from).toBe(1)
      expect(migrations[0]?.to).toBe(2)
    })
  })
  ```
  with:
  ```ts
  describe("migrations", () => {
    it("ships ordered v1->v2 and v2->v3 migrations", () => {
      expect(migrations).toHaveLength(2)
      expect(migrations[0]?.from).toBe(1)
      expect(migrations[0]?.to).toBe(2)
      expect(migrations[1]?.from).toBe(2)
      expect(migrations[1]?.to).toBe(3)
    })
  })
  ```

  Replace the "passes an already-current config through" test:
  ```ts
    it("passes an already-current config through and validates it", () => {
      const current = {
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
      }
      expect(runMigrations(current)).toEqual({ ok: true, value: current })
    })
  ```
  with:
  ```ts
    it("passes an already-current config through and validates it", () => {
      const current = {
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        profiles: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
      }
      expect(runMigrations(current)).toEqual({ ok: true, value: current })
    })

    it("migrates a v2 config to v3 by seeding an empty profiles array when none exists", () => {
      const v2Config = {
        version: 2,
        providers: [],
        aliases: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
      }
      const result = runMigrations(v2Config)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
      expect(result.value.profiles).toEqual([])
    })

    it("preserves an existing profiles array when migrating v2 to v3", () => {
      const v2WithProfiles = {
        version: 2,
        providers: [],
        aliases: [],
        profiles: [
          { id: "pr_default", name: "Default", harnessId: "claude", alias: "fast", env: {} },
        ],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" as const },
      }
      const result = runMigrations(v2WithProfiles)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.profiles).toEqual([
        { id: "pr_default", name: "Default", harnessId: "claude", alias: "fast", env: {} },
      ])
    })
  ```

  Note: the existing `v1Config` fixture has no `profiles`; after CS.1 + CS.2 the
  "migrates a v1 config to v2" test now runs v1→v2→v3 and the validated result will
  carry `profiles: []` — its existing assertions (version, provider secrets) remain
  true, so leave that test unchanged.

- [ ] **Step 2: Run test, expect RED** — `bun test packages/config/src/migrations.test.ts`. Expected failure: `migrations` has length 1 (the new `toHaveLength(2)` and `migrations[1]` checks fail), and the v2→v3 round-trip tests fail because no step advances version 2 → 3 (`runMigrations` returns `migration-failed: no migration from version 2`).

- [ ] **Step 3: Implement** — in `packages/config/src/migrations.ts`, add `v2ToV3` immediately after the `v1ToV2` definition and before the `migrations` export:
  ```ts
  /**
   * v3 introduces top-level `profiles`. Older documents have no such field, so this seeds
   * `profiles: []` when it is missing or not an array, and otherwise passes the existing
   * array through untouched. Validation against `ConfigSchema` happens after all steps run.
   */
  const v2ToV3: Migration = {
    from: 2,
    to: 3,
    migrate: (raw) => ({
      ...raw,
      version: 3,
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
    }),
  }
  ```
  Then replace the `migrations` export line:
  ```ts
  export const migrations: readonly Migration[] = [v1ToV2]
  ```
  with:
  ```ts
  export const migrations: readonly Migration[] = [v1ToV2, v2ToV3]
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/config/src/migrations.test.ts`

- [ ] **Step 5: Commit** — `git add packages/config/src/migrations.ts packages/config/src/migrations.test.ts && git commit -m "config: add v2->v3 migration seeding profiles (CS.2)"`

---

### Task CS.3: Accept `name`/`cwd` on `SessionInput` and add the `running`/`limit`/`offset` filter fields

Extend the two store-facing types only (no behavior yet): `SessionInput` gains optional
`name?`/`cwd?`, and `SessionFilter` gains optional `running?`/`limit?`/`offset?`. Doing
this first keeps the later behavior tasks compiling. This is a types-only change, so the
RED test is a compile-time assignability check.

**Files:**
- Modify: `packages/sessions/src/store.ts:13` (`SessionInput`), `:19` (`SessionFilter`)
- Test: `packages/sessions/src/store.test.ts`

- [ ] **Step 1: Write the failing test** — append to the end of `packages/sessions/src/store.test.ts`:
  ```ts
  describe("SessionInput and SessionFilter shapes", () => {
    it("accepts optional name and cwd on a SessionInput literal", () => {
      const input: SessionInput = {
        harnessId: "claude" as never,
        alias: "default" as never,
        name: "my run",
        cwd: "/tmp/project",
      }
      expect(input.name).toBe("my run")
      expect(input.cwd).toBe("/tmp/project")
    })

    it("accepts optional running, limit and offset on a SessionFilter literal", () => {
      const filter: SessionFilter = {
        running: true,
        limit: 10,
        offset: 5,
      }
      expect(filter.running).toBe(true)
      expect(filter.limit).toBe(10)
      expect(filter.offset).toBe(5)
    })
  })
  ```
  and extend the existing top import to bring the types in:
  ```ts
  import {
    type SessionFilter,
    type SessionInput,
    createSessionStore,
  } from "./store"
  ```
  (replacing the existing `import { createSessionStore } from "./store"` line).

- [ ] **Step 2: Run test, expect RED** — `bun test packages/sessions/src/store.test.ts`. Expected failure: TypeScript reports `name`/`cwd` are not assignable to `SessionInput` and `running`/`limit`/`offset` are not assignable to `SessionFilter` (excess-property errors on the object literals), so the file fails to typecheck/run.

- [ ] **Step 3: Implement** — in `packages/sessions/src/store.ts` replace the `SessionInput` type:
  ```ts
  /** Fields the caller supplies; `id` and `startedAt` are generated by the store. */
  export type SessionInput = {
    readonly harnessId: HarnessId
    readonly alias: AliasName
    readonly name?: string
    readonly cwd?: string
  }
  ```
  and the `SessionFilter` type:
  ```ts
  /**
   * Optional, all-`AND` filter for `query`. `since` is an inclusive `startedAt >=` bound;
   * `running` selects open (`true`) or closed (`false`) sessions; `limit`/`offset` paginate
   * the `startedAt DESC` result.
   */
  export type SessionFilter = {
    readonly harnessId?: HarnessId
    readonly alias?: AliasName
    readonly since?: string
    readonly running?: boolean
    readonly limit?: number
    readonly offset?: number
  }
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/sessions/src/store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/sessions/src/store.ts packages/sessions/src/store.test.ts && git commit -m "sessions: extend SessionInput/SessionFilter shapes (CS.3)"`

---

### Task CS.4: Idempotent `name`/`cwd` column add in `init()`

After the existing `CREATE TABLE` + index statements, `init()` inspects the live schema
with `PRAGMA table_info(sessions)` and issues `ALTER TABLE sessions ADD COLUMN name TEXT`
/ `... cwd TEXT` only for columns that are absent — so a fresh DB (already has the columns
via a future `CREATE TABLE`, or here via `ALTER`) and a legacy DB (old `CREATE TABLE`
without them) both converge, and running `init()` twice never errors. Because the
in-memory fake cannot model `PRAGMA table_info`, this task drives the **real**
`createBunSqliteDatabase(":memory:")` and seeds the OLD table shape first.

**Files:**
- Modify: `packages/sessions/src/store.ts:32` (`CREATE_TABLE` neighbours — add column-add SQL constants), `:100` (`init`)
- Test: `packages/sessions/src/bun-sqlite.integration.test.ts`

- [ ] **Step 1: Write the failing test** — append a new describe block to `packages/sessions/src/bun-sqlite.integration.test.ts`:
  ```ts
  describe("createSessionStore.init column migration against real bun:sqlite", () => {
    // The pre-v?? table shape: no name/cwd columns.
    const LEGACY_CREATE_TABLE = `CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      harnessId TEXT NOT NULL,
      alias TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      exitCode INTEGER
    )`

    const columnNames = (db: ReturnType<typeof createBunSqliteDatabase>): string[] => {
      const info = db.all("PRAGMA table_info(sessions)", [])
      if (!isOk(info)) return []
      return info.value.map((row) => String(row.name))
    }

    it("adds name and cwd columns to a legacy sessions table when init() runs", () => {
      const db = createBunSqliteDatabase(":memory:")
      expect(isOk(db.exec(LEGACY_CREATE_TABLE))).toBe(true)
      expect(columnNames(db)).not.toContain("name")
      expect(columnNames(db)).not.toContain("cwd")

      const store = createSessionStore({
        db,
        clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
        idGen: createSequentialIdGen(),
      })
      expect(isOk(store.init())).toBe(true)

      const cols = columnNames(db)
      expect(cols).toContain("name")
      expect(cols).toContain("cwd")
    })

    it("is idempotent — running init() twice on a legacy table does not error", () => {
      const db = createBunSqliteDatabase(":memory:")
      expect(isOk(db.exec(LEGACY_CREATE_TABLE))).toBe(true)
      const store = createSessionStore({
        db,
        clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
        idGen: createSequentialIdGen(),
      })
      expect(isOk(store.init())).toBe(true)
      expect(isOk(store.init())).toBe(true)
      const cols = columnNames(db)
      expect(cols.filter((c) => c === "name")).toHaveLength(1)
      expect(cols.filter((c) => c === "cwd")).toHaveLength(1)
    })

    it("adds name and cwd on a fresh database created by init() alone", () => {
      const db = createBunSqliteDatabase(":memory:")
      const store = createSessionStore({
        db,
        clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
        idGen: createSequentialIdGen(),
      })
      expect(isOk(store.init())).toBe(true)
      const cols = columnNames(db)
      expect(cols).toContain("name")
      expect(cols).toContain("cwd")
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/sessions/src/bun-sqlite.integration.test.ts`. Expected failure: after `init()` the legacy table still lacks `name`/`cwd` (`expect(cols).toContain("name")` fails) because `init()` does not yet add columns.

- [ ] **Step 3: Implement** — in `packages/sessions/src/store.ts`, add the SQL constants next to the existing ones (after `CREATE_INDEX_HARNESS`):
  ```ts
  const PRAGMA_COLUMNS = "PRAGMA table_info(sessions)"
  const ADD_COLUMN_NAME = "ALTER TABLE sessions ADD COLUMN name TEXT"
  const ADD_COLUMN_CWD = "ALTER TABLE sessions ADD COLUMN cwd TEXT"
  ```
  Then replace the `init` function body:
  ```ts
    const init = (): Result<void, SessionError> => {
      const table = db.exec(CREATE_TABLE)
      if (isErr(table)) return table
      const started = db.exec(CREATE_INDEX_STARTED)
      if (isErr(started)) return started
      const harness = db.exec(CREATE_INDEX_HARNESS)
      if (isErr(harness)) return harness

      const info = db.all(PRAGMA_COLUMNS, [])
      if (isErr(info)) return info
      const existing = new Set(info.value.map((row) => String(row.name)))

      if (!existing.has("name")) {
        const added = db.exec(ADD_COLUMN_NAME)
        if (isErr(added)) return added
      }
      if (!existing.has("cwd")) {
        const added = db.exec(ADD_COLUMN_CWD)
        if (isErr(added)) return added
      }
      return ok(undefined)
    }
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/sessions/src/bun-sqlite.integration.test.ts`

- [ ] **Step 5: Commit** — `git add packages/sessions/src/store.ts packages/sessions/src/bun-sqlite.integration.test.ts && git commit -m "sessions: idempotent name/cwd column add in init() (CS.4)"`

---

### Task CS.5: `create()` writes `name`/`cwd`

The INSERT now lists `name`, `cwd` columns and binds `input.name ?? null` /
`input.cwd ?? null` (so omitted fields persist as SQL `NULL`). The returned `Session`
includes `name`/`cwd` only when the input supplied them — matching how `toSession` already
omits NULL `endedAt`/`exitCode`. The in-memory fake parses INSERT columns and round-trips
them through `get`, so it can verify both the parameterization and the returned shape.

**Files:**
- Modify: `packages/sessions/src/store.ts:45` (`INSERT_SESSION`), `:54` (`toSession`), `:112` (`create`)
- Test: `packages/sessions/src/store.test.ts`

- [ ] **Step 1: Write the failing test** — append to `packages/sessions/src/store.test.ts`:
  ```ts
  describe("createSessionStore.create with name and cwd", () => {
    it("returns a Session carrying name and cwd when create() is given them", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      const r = store.create({
        harnessId: "claude" as never,
        alias: "default" as never,
        name: "nightly",
        cwd: "/work/app",
      })
      expect(isOk(r) && r.value).toEqual<
        | false
        | {
            id: string
            harnessId: string
            alias: string
            startedAt: string
            name: string
            cwd: string
          }
      >({
        id: "s_1",
        harnessId: "claude",
        alias: "default",
        startedAt: "2026-05-23T10:00:00.000Z",
        name: "nightly",
        cwd: "/work/app",
      })
    })

    it("omits name and cwd from the returned Session when create() is not given them", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      const r = store.create({
        harnessId: "claude" as never,
        alias: "default" as never,
      })
      expect(isOk(r) && r.value).toEqual<
        | false
        | { id: string; harnessId: string; alias: string; startedAt: string }
      >({
        id: "s_1",
        harnessId: "claude",
        alias: "default",
        startedAt: "2026-05-23T10:00:00.000Z",
      })
    })

    it("binds name and cwd in params and never interpolates them when create() runs", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.create({
        harnessId: "claude" as never,
        alias: "default" as never,
        name: "nightly",
        cwd: "/work/app",
      })
      const insert = deps.db.statements().find((s) => /^\s*INSERT/i.test(s.sql))
      expect(insert?.sql).toContain("name")
      expect(insert?.sql).toContain("cwd")
      expect(insert?.sql).not.toContain("nightly")
      expect(insert?.sql).not.toContain("/work/app")
      expect(insert?.params).toEqual([
        "s_1",
        "claude",
        "default",
        "2026-05-23T10:00:00.000Z",
        "nightly",
        "/work/app",
      ])
    })

    it("binds null for an omitted name and cwd when create() runs without them", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.create({ harnessId: "claude" as never, alias: "default" as never })
      const insert = deps.db.statements().find((s) => /^\s*INSERT/i.test(s.sql))
      expect(insert?.params).toEqual([
        "s_1",
        "claude",
        "default",
        "2026-05-23T10:00:00.000Z",
        null,
        null,
      ])
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/sessions/src/store.test.ts`. Expected failure: the INSERT params have length 4 (no `name`/`cwd`), so the `toEqual([... 6 values])` assertions fail, and the returned Session lacks `name`/`cwd`.

  Note: the existing `create` tests "issues a parameterized INSERT … params [4 values]" and the round-trip create test will also break once columns are added. Update those two existing expectations in the same RED step — the 4-element `toEqual([...])` in "issues a parameterized INSERT whose values live in params" becomes the 6-element form ending in `null, null`, and add `expect(insert?.sql).toContain("name")` is **not** required there. Concretely, replace:
  ```ts
      expect(insert?.params).toEqual([
        "s_1",
        "claude",
        "default",
        "2026-05-23T10:00:00.000Z",
      ])
  ```
  (in the existing "issues a parameterized INSERT whose values live in params" test) with:
  ```ts
      expect(insert?.params).toEqual([
        "s_1",
        "claude",
        "default",
        "2026-05-23T10:00:00.000Z",
        null,
        null,
      ])
  ```
  The existing "returns a Session with the id from idGen …" test creates without name/cwd and asserts the 4-field Session, which still holds because the implementation omits absent fields — leave it unchanged.

- [ ] **Step 3: Implement** — in `packages/sessions/src/store.ts` replace the `INSERT_SESSION` constant:
  ```ts
  const INSERT_SESSION =
    "INSERT INTO sessions (id, harnessId, alias, startedAt, name, cwd) VALUES (?, ?, ?, ?, ?, ?)"
  ```
  Update `toSession` to surface the new columns when non-null:
  ```ts
  /** Map a raw sqlite row into a Session, dropping NULL endedAt/exitCode/name/cwd. */
  const toSession = (row: Record<string, unknown>): Session => {
    const base: Session = {
      id: row.id as SessionId,
      harnessId: row.harnessId as HarnessId,
      alias: row.alias as AliasName,
      startedAt: String(row.startedAt),
    }
    const endedAt = row.endedAt
    const exitCode = row.exitCode
    const name = row.name
    const cwd = row.cwd
    return {
      ...base,
      ...(typeof endedAt === "string" ? { endedAt } : {}),
      ...(typeof exitCode === "number" ? { exitCode } : {}),
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof cwd === "string" ? { cwd } : {}),
    }
  }
  ```
  Replace the `create` body:
  ```ts
      create: (input: SessionInput): Result<Session, SessionError> => {
        const id = deps.idGen.next("s") as SessionId
        const startedAt = deps.clock.now().toISOString()
        const written = db.run(INSERT_SESSION, [
          id,
          input.harnessId,
          input.alias,
          startedAt,
          input.name ?? null,
          input.cwd ?? null,
        ])
        if (isErr(written)) return written
        return ok({
          id,
          harnessId: input.harnessId,
          alias: input.alias,
          startedAt,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        })
      },
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/sessions/src/store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/sessions/src/store.ts packages/sessions/src/store.test.ts && git commit -m "sessions: create() persists and returns name/cwd (CS.5)"`

---

### Task CS.6: `query()` honours `running`, `limit`, and `offset`

`buildWhere` gains a `running` predicate: `running === true` appends `endedAt IS NULL`,
`running === false` appends `endedAt IS NOT NULL` (no bound param either way — it is a
column-only predicate). `query` keeps `ORDER BY startedAt DESC`, then appends `LIMIT ?`
and/or `OFFSET ?` with their values pushed onto the positional params, in that order.
SQL-string + params assertions run on the in-memory fake (which records but ignores the
`IS NULL`/`LIMIT`/`OFFSET` clauses), and a behavioral `running` check runs on real
bun:sqlite.

**Files:**
- Modify: `packages/sessions/src/store.ts:71` (`buildWhere`), `:138` (`query`)
- Test: `packages/sessions/src/store.test.ts` (SQL/param assertions) and `packages/sessions/src/bun-sqlite.integration.test.ts` (behavioral `running`)

- [ ] **Step 1: Write the failing test** — append to `packages/sessions/src/store.test.ts`:
  ```ts
  describe("createSessionStore.query with running, limit and offset", () => {
    it("adds an endedAt IS NULL predicate with no extra param when query() filters running true", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query({ running: true })
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).toMatch(/WHERE endedAt IS NULL/i)
      expect(select?.sql).toMatch(/ORDER BY startedAt DESC/i)
      expect(select?.params).toEqual([])
    })

    it("adds an endedAt IS NOT NULL predicate when query() filters running false", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query({ running: false })
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).toMatch(/WHERE endedAt IS NOT NULL/i)
      expect(select?.params).toEqual([])
    })

    it("combines a value filter and running with AND, binding only the value param, when query() filters both", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query({ harnessId: "claude" as never, running: true })
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).toMatch(/WHERE harnessId = \? AND endedAt IS NULL/i)
      expect(select?.params).toEqual(["claude"])
    })

    it("appends LIMIT and OFFSET as bound params after ORDER BY when query() paginates", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query({ limit: 10, offset: 5 })
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).toMatch(/ORDER BY startedAt DESC LIMIT \? OFFSET \?/i)
      expect(select?.sql).not.toContain("10")
      expect(select?.sql).not.toContain("5")
      expect(select?.params).toEqual([10, 5])
    })

    it("orders WHERE params before LIMIT and OFFSET params when query() filters and paginates", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query({
        harnessId: "claude" as never,
        since: "2026-05-23T00:00:00.000Z",
        limit: 2,
        offset: 4,
      })
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).toMatch(
        /WHERE harnessId = \? AND startedAt >= \? ORDER BY startedAt DESC LIMIT \? OFFSET \?/i,
      )
      expect(select?.params).toEqual([
        "claude",
        "2026-05-23T00:00:00.000Z",
        2,
        4,
      ])
    })

    it("omits LIMIT and OFFSET from the sql when query() does not paginate", () => {
      const deps = makeDeps()
      const store = createSessionStore(deps)
      store.init()
      store.query()
      const select = deps.db.statements().find((s) => /^\s*SELECT/i.test(s.sql))
      expect(select?.sql).not.toMatch(/LIMIT/i)
      expect(select?.sql).not.toMatch(/OFFSET/i)
    })
  })
  ```
  Also append a behavioral `running` test to `packages/sessions/src/bun-sqlite.integration.test.ts`:
  ```ts
  describe("createSessionStore.query running filter against real bun:sqlite", () => {
    it("returns only open sessions when query() filters running true", () => {
      const db = createBunSqliteDatabase(":memory:")
      const store = createSessionStore({
        db,
        clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
        idGen: createSequentialIdGen(),
      })
      store.init()
      store.create({ harnessId: "claude" as never, alias: "default" as never })
      store.create({ harnessId: "codex" as never, alias: "fast" as never })
      store.close("s_1" as never, 0)

      const open = store.query({ running: true })
      expect(isOk(open) && open.value.map((s) => s.id)).toEqual<false | string[]>([
        "s_2",
      ])

      const closed = store.query({ running: false })
      expect(isOk(closed) && closed.value.map((s) => s.id)).toEqual<
        false | string[]
      >(["s_1"])
    })

    it("limits and offsets the startedAt DESC result when query() paginates against real bun:sqlite", () => {
      const db = createBunSqliteDatabase(":memory:")
      const store = createSessionStore({
        db,
        clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
        idGen: createSequentialIdGen(),
      })
      store.init()
      db.run(
        "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
        ["s_a", "claude", "default", "2026-05-23T09:00:00.000Z"],
      )
      db.run(
        "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
        ["s_b", "claude", "default", "2026-05-23T10:00:00.000Z"],
      )
      db.run(
        "INSERT INTO sessions (id, harnessId, alias, startedAt) VALUES (?, ?, ?, ?)",
        ["s_c", "claude", "default", "2026-05-23T11:00:00.000Z"],
      )
      const page = store.query({ limit: 1, offset: 1 })
      expect(isOk(page) && page.value.map((s) => s.id)).toEqual<false | string[]>([
        "s_b",
      ])
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/sessions/src/store.test.ts packages/sessions/src/bun-sqlite.integration.test.ts`. Expected failure: `query` ignores the new fields, so the SQL never contains `endedAt IS NULL` / `LIMIT ? OFFSET ?`, the param arrays differ, and the real-DB `running`/pagination results return every row.

- [ ] **Step 3: Implement** — in `packages/sessions/src/store.ts` replace `buildWhere`:
  ```ts
  /** Build a parameterized WHERE from a filter: column names go in the sql, values go in params. */
  const buildWhere = (
    filter: SessionFilter,
  ): { readonly clause: string; readonly params: readonly unknown[] } => {
    const conditions: string[] = []
    const params: unknown[] = []
    if (filter.harnessId !== undefined) {
      conditions.push("harnessId = ?")
      params.push(filter.harnessId)
    }
    if (filter.alias !== undefined) {
      conditions.push("alias = ?")
      params.push(filter.alias)
    }
    if (filter.since !== undefined) {
      conditions.push("startedAt >= ?")
      params.push(filter.since)
    }
    if (filter.running === true) {
      conditions.push("endedAt IS NULL")
    } else if (filter.running === false) {
      conditions.push("endedAt IS NOT NULL")
    }
    const clause =
      conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : ""
    return { clause, params }
  }
  ```
  Replace the `query` body:
  ```ts
      query: (
        filter?: SessionFilter,
      ): Result<readonly Session[], SessionError> => {
        const active = filter ?? {}
        const { clause, params: whereParams } = buildWhere(active)
        const params: unknown[] = [...whereParams]
        let sql = `${SELECT_COLUMNS}${clause} ORDER BY startedAt DESC`
        if (active.limit !== undefined) {
          sql += " LIMIT ?"
          params.push(active.limit)
        }
        if (active.offset !== undefined) {
          sql += " OFFSET ?"
          params.push(active.offset)
        }
        const rows = db.all(sql, params)
        if (isErr(rows)) return rows
        return ok(rows.value.map(toSession))
      },
  ```
  Also extend the `SELECT_COLUMNS` constant so the new columns are read back:
  ```ts
  const SELECT_COLUMNS =
    "SELECT id, harnessId, alias, startedAt, endedAt, exitCode, name, cwd FROM sessions"
  ```

  Note on existing tests: the column-list change is observed by the existing
  "declares every Session column" `init` test only for the CREATE TABLE statement
  (unaffected) and by the `query` SQL assertions, which match with `toMatch`/`toContain`
  rather than exact equality, so they continue to pass. The existing
  "issues a SELECT with no WHERE clause" test asserts `not.toMatch(/WHERE/i)` and
  `toMatch(/ORDER BY startedAt DESC/i)` — still true.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/sessions/src/store.test.ts packages/sessions/src/bun-sqlite.integration.test.ts`

- [ ] **Step 5: Commit** — `git add packages/sessions/src/store.ts packages/sessions/src/store.test.ts packages/sessions/src/bun-sqlite.integration.test.ts && git commit -m "sessions: query() honours running/limit/offset (CS.6)"`

---

### Task CS.7: Package-level barrel + index regression sweep

No new public symbols are introduced (all additions are on already-exported types
`Config`, `Migration`, `SessionInput`, `SessionFilter` and already-exported factories).
This task is a guard: confirm the two `index.test.ts` barrels still pass with the bumped
version and the extended types, and that no deep imports or new exports were needed.

**Files:**
- Test (run, do not necessarily edit): `packages/config/src/index.test.ts`, `packages/sessions/src/index.test.ts`

- [ ] **Step 1: Write the failing test** — only if a barrel test pins `CURRENT_CONFIG_VERSION` or enumerates exact field lists. Inspect both `index.test.ts` files; if either asserts the config version or a `Config`/`Session` field set, update that expectation to the new shape (version `3`, `profiles` present, session `name`/`cwd` present). If neither does, no test edit is required and this step is satisfied by the existing suite. Do not invent new assertions.

- [ ] **Step 2: Run test, expect RED** — `bun test packages/config/src/index.test.ts packages/sessions/src/index.test.ts`. Expected outcome: GREEN already if the barrels only assert exported symbol names; RED (then fixed in Step 1) only if a barrel pins the version number or field list.

- [ ] **Step 3: Implement** — none beyond any Step 1 test edit; the barrels in `packages/config/src/index.ts` and `packages/sessions/src/index.ts` already re-export every changed symbol.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/config/src/index.test.ts packages/sessions/src/index.test.ts`

- [ ] **Step 5: Commit** — only if a test edit was made: `git add packages/config/src/index.test.ts packages/sessions/src/index.test.ts && git commit -m "test: align config/sessions barrel tests with v3 + name/cwd (CS.7)"`. Otherwise skip (nothing to commit).

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green.
## Phase 3 — `@launchkit/pty` + `@launchkit/harnesses` (durable scrollback, name/cwd, env overrides)

This phase adds a **durable, file-based** `ScrollbackStore` to `@launchkit/pty` (separate from the
existing in-memory `scrollback.ts` ring buffer), threads `name`/`cwd` through the terminal manager and
the pty `open` call, taps the live pty data stream into the store, and gives `@launchkit/harnesses` a
`cwd` spawn parameter plus `cwd`/`env` launch overrides.

Every effect (filesystem, spawn) stays behind an injected adapter interface with an in-memory fake;
every fallible operation returns `Result<T, E>` from `@launchkit/utils` — nothing throws. TDD is
mandatory: RED → GREEN → REFACTOR, one `it("does X when Y happens")` at a time.

### Contract notes (read before starting)
- `PtyError` (current, `packages/pty/src/pty.ts:4`) is
  `{ kind: "open-failed"; detail } | { kind: "not-found"; id }`. The file store's fs failures
  (open/write/read/rename) are neither a pty-spawn failure nor a missing-session lookup, so this phase
  **extends the union with a new `scrollback-io` kind** (Task PH.1): `{ kind: "scrollback-io"; detail: string }`.
  This is the only contract extension; it follows the existing tagged-union pattern exactly.
- `SessionInput` (`@launchkit/sessions`, `packages/sessions/src/store.ts:13`) already carries optional
  `name`/`cwd` from an earlier phase. The manager's narrow `SessionSink.create` input type
  (`packages/pty/src/manager.ts:24`) is widened here to forward them.
- `createTerminalManager` deps (`TerminalManagerDeps`, `packages/pty/src/manager.ts:31`) gain one field:
  `readonly scrollback: ScrollbackStore`.

---

### Task PH.1: Add the `scrollback-io` kind to `PtyError`
Establish the error variant the file store and its fs adapter will return, before any code references it.

**Files:**
- Modify: `packages/pty/src/pty.ts:4` (extend the `PtyError` union)
- Test: `packages/pty/src/pty.test.ts` (append a case to the existing suite)

- [ ] **Step 1: Write the failing test** — append to `packages/pty/src/pty.test.ts`:
```ts
import { describe, expect, it } from "bun:test"
import type { PtyError } from "./pty"

describe("PtyError", () => {
  it("includes a scrollback-io variant carrying a detail string when a store fs op fails", () => {
    const e: PtyError = { kind: "scrollback-io", detail: "ENOSPC" }
    expect(e.kind).toBe("scrollback-io")
    expect(e.detail).toBe("ENOSPC")
  })
})
```
(Keep the file's existing `createFakePty` tests; add this `describe` alongside them.)

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/pty.test.ts`
  Expected failure: TS compile error — `Type '"scrollback-io"' is not assignable` / object literal not
  assignable to `PtyError` (the `scrollback-io` member does not exist yet).

- [ ] **Step 3: Implement** — extend the union in `packages/pty/src/pty.ts`:
```ts
export type PtyError =
  | { readonly kind: "open-failed"; readonly detail: string }
  | { readonly kind: "not-found"; readonly id: SessionId }
  | { readonly kind: "scrollback-io"; readonly detail: string }
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/pty.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/pty.ts packages/pty/src/pty.test.ts && git commit -m "feat(pty): add scrollback-io PtyError variant (PH.1)"`

---

### Task PH.2: Define the `ScrollbackFs` adapter + in-memory fake
Introduce the minimal fs effect interface the file store needs (append-writer lifecycle, whole-file read,
rename, unlink, exists) and a deterministic in-memory fake for unit tests. No store logic yet.

**Files:**
- Create: `packages/pty/src/scrollback-store.ts` (adapter interface + fake only in this task)
- Test: `packages/pty/src/scrollback-store.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/pty/src/scrollback-store.test.ts`:
```ts
import { describe, expect, it } from "bun:test"
import { createMemoryScrollbackFs } from "./scrollback-store"

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const dec = (u: Uint8Array): string => new TextDecoder().decode(u)

describe("createMemoryScrollbackFs", () => {
  it("appends bytes through an open writer and reads them back when the file is read whole", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.value.write(enc("ab")).ok).toBe(true)
    expect(w.value.write(enc("cd")).ok).toBe(true)
    expect(w.value.close().ok).toBe(true)
    const r = fs.readWhole("/d/a.bin")
    expect(r.ok && dec(r.value)).toBe("abcd")
  })

  it("reports existence and removes a file when unlink is called", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    if (!w.ok) return
    w.value.write(enc("x"))
    w.value.close()
    expect(fs.exists("/d/a.bin")).toBe(true)
    expect(fs.unlink("/d/a.bin").ok).toBe(true)
    expect(fs.exists("/d/a.bin")).toBe(false)
  })

  it("renames a file so the old path is gone and the new path holds the bytes", () => {
    const fs = createMemoryScrollbackFs()
    const w = fs.openAppend("/d/a.bin")
    if (!w.ok) return
    w.value.write(enc("keep"))
    w.value.close()
    expect(fs.rename("/d/a.bin", "/d/a.1.bin").ok).toBe(true)
    expect(fs.exists("/d/a.bin")).toBe(false)
    const r = fs.readWhole("/d/a.1.bin")
    expect(r.ok && dec(r.value)).toBe("keep")
  })

  it("returns a scrollback-io error when reading a path that does not exist", () => {
    const fs = createMemoryScrollbackFs()
    const r = fs.readWhole("/d/missing.bin")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/scrollback-store.test.ts`
  Expected failure: `Cannot find module "./scrollback-store"` (file does not exist yet).

- [ ] **Step 3: Implement** — create `packages/pty/src/scrollback-store.ts` with the adapter interface and
  the in-memory fake (the store factory comes in PH.3):
```ts
import type { SessionId } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import type { PtyError } from "./pty"

/** A sequential append writer: open once, write N times, close once. */
export interface ScrollbackAppendWriter {
  write(chunk: Uint8Array): Result<void, PtyError>
  close(): Result<void, PtyError>
}

/**
 * Minimal filesystem effect surface the file-based scrollback store needs. Real adapter wraps Bun's
 * FileSink + node:fs; the in-memory fake makes the store unit-testable with no disk.
 */
export interface ScrollbackFs {
  /** Open `path` for appending (creating it if absent), returning a writer. */
  openAppend(path: string): Result<ScrollbackAppendWriter, PtyError>
  /** Read the entire file at `path`. Missing file => scrollback-io err. */
  readWhole(path: string): Result<Uint8Array, PtyError>
  /** True when `path` exists. */
  exists(path: string): boolean
  /** Rename `from` to `to`, replacing any existing `to`. */
  rename(from: string, to: string): Result<void, PtyError>
  /** Remove `path`; removing a missing path is a no-op success. */
  unlink(path: string): Result<void, PtyError>
}

const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** In-memory `ScrollbackFs` fake: a path -> bytes map. Deterministic, disk-free. */
export const createMemoryScrollbackFs = (): ScrollbackFs => {
  const files = new Map<string, Uint8Array>()
  return {
    openAppend: (path): Result<ScrollbackAppendWriter, PtyError> => {
      if (!files.has(path)) files.set(path, new Uint8Array(0))
      return ok({
        write: (chunk): Result<void, PtyError> => {
          files.set(path, concatBytes(files.get(path) ?? new Uint8Array(0), chunk))
          return ok(undefined)
        },
        close: (): Result<void, PtyError> => ok(undefined),
      })
    },
    readWhole: (path): Result<Uint8Array, PtyError> => {
      const bytes = files.get(path)
      if (bytes === undefined)
        return err({ kind: "scrollback-io", detail: `no such file: ${path}` })
      return ok(bytes)
    },
    exists: (path): boolean => files.has(path),
    rename: (from, to): Result<void, PtyError> => {
      const bytes = files.get(from)
      if (bytes === undefined)
        return err({ kind: "scrollback-io", detail: `no such file: ${from}` })
      files.delete(from)
      files.set(to, bytes)
      return ok(undefined)
    },
    unlink: (path): Result<void, PtyError> => {
      files.delete(path)
      return ok(undefined)
    },
  }
}

// (createFileScrollbackStore / createMemoryScrollbackStore / createBunScrollbackFs land in PH.3–PH.6.)
export type { SessionId }
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/scrollback-store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/scrollback-store.ts packages/pty/src/scrollback-store.test.ts && git commit -m "feat(pty): ScrollbackFs adapter interface + in-memory fake (PH.2)"`

---

### Task PH.3: `createFileScrollbackStore` — append + read + path safety
Add the store factory. `append`/`read`/`close` operate on `<dir>/<id>.bin` via the injected
`ScrollbackFs`. Reject unsafe ids before touching the fs.

**Files:**
- Modify: `packages/pty/src/scrollback-store.ts` (add `ScrollbackStore` interface + `createFileScrollbackStore`)
- Test: `packages/pty/src/scrollback-store.test.ts` (add a `createFileScrollbackStore` describe)

- [ ] **Step 1: Write the failing test** — add to `packages/pty/src/scrollback-store.test.ts`:
```ts
import { SessionIdSchema } from "@launchkit/types"
import { createFileScrollbackStore } from "./scrollback-store"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("createFileScrollbackStore", () => {
  it("appends chunks for a session and reads them back concatenated", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    expect(store.append(id, enc("foo")).ok).toBe(true)
    expect(store.append(id, enc("bar")).ok).toBe(true)
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("foobar")
  })

  it("writes to <dir>/<id>.bin", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    store.append(id, enc("hi"))
    expect(fs.exists("/scroll/s_00000000-0000-4000-8000-000000000000.bin")).toBe(true)
  })

  it("returns an empty buffer when reading a session that has no data yet", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const r = store.read(id)
    expect(r.ok && r.value.length).toBe(0)
  })

  it("rejects an id containing a path separator with a scrollback-io error", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const bad = "../escape" as unknown as typeof id
    const r = store.append(bad, enc("x"))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })

  it("rejects a read for an id with a backslash without touching the fs", () => {
    const fs = createMemoryScrollbackFs()
    const store = createFileScrollbackStore({ dir: "/scroll", fs })
    const bad = "a\\b" as unknown as typeof id
    const r = store.read(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("scrollback-io")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/scrollback-store.test.ts`
  Expected failure: `createFileScrollbackStore` is not exported from `./scrollback-store`.

- [ ] **Step 3: Implement** — in `packages/pty/src/scrollback-store.ts`, add the interface, the safe-id
  guard, the default cap constant, and the factory (rotation lands in PH.4 — here `read` already concats
  the `.1.bin` rotated file if present so PH.4 only adds the rotate trigger):
```ts
export interface ScrollbackStore {
  append(id: SessionId, chunk: Uint8Array): Result<void, PtyError>
  read(id: SessionId): Result<Uint8Array, PtyError>
  close(id: SessionId): Result<void, PtyError>
}

const DEFAULT_CAP_BYTES = 1024 * 1024

/** Reject ids that are empty or could escape `dir` (separators / parent refs). */
const safeId = (id: SessionId): Result<string, PtyError> => {
  const s = String(id)
  if (s.length === 0 || s.includes("/") || s.includes("\\") || s.includes("..")) {
    return err({ kind: "scrollback-io", detail: `unsafe session id: ${s}` })
  }
  return ok(s)
}

export const createFileScrollbackStore = (deps: {
  dir: string
  fs: ScrollbackFs
  capBytes?: number
}): ScrollbackStore => {
  const capBytes = deps.capBytes ?? DEFAULT_CAP_BYTES
  // Per-session open append writer + the byte count written to the CURRENT <id>.bin (reset on rotate).
  const open = new Map<string, { writer: ScrollbackAppendWriter; bytes: number }>()

  const mainPath = (safe: string): string => `${deps.dir}/${safe}.bin`
  const rotatedPath = (safe: string): string => `${deps.dir}/${safe}.1.bin`

  const writerFor = (
    safe: string,
  ): Result<{ writer: ScrollbackAppendWriter; bytes: number }, PtyError> => {
    const existing = open.get(safe)
    if (existing !== undefined) return ok(existing)
    const opened = deps.fs.openAppend(mainPath(safe))
    if (!opened.ok) return opened
    const entry = { writer: opened.value, bytes: 0 }
    open.set(safe, entry)
    return ok(entry)
  }

  return {
    append: (id, chunk): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const entry = writerFor(safe.value)
      if (!entry.ok) return entry
      const written = entry.value.writer.write(chunk)
      if (!written.ok) return written
      entry.value.bytes += chunk.length
      // Rotation trigger added in PH.4.
      return ok(undefined)
    },

    read: (id): Result<Uint8Array, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const out: Uint8Array[] = []
      if (deps.fs.exists(rotatedPath(safe.value))) {
        const prev = deps.fs.readWhole(rotatedPath(safe.value))
        if (!prev.ok) return prev
        out.push(prev.value)
      }
      if (deps.fs.exists(mainPath(safe.value))) {
        const cur = deps.fs.readWhole(mainPath(safe.value))
        if (!cur.ok) return cur
        out.push(cur.value)
      }
      const total = out.reduce((n, b) => n + b.length, 0)
      const merged = new Uint8Array(total)
      let off = 0
      for (const b of out) {
        merged.set(b, off)
        off += b.length
      }
      return ok(merged)
    },

    close: (id): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      const entry = open.get(safe.value)
      if (entry === undefined) return ok(undefined)
      open.delete(safe.value)
      return entry.writer.close()
    },
  }
}
```
Reference `capBytes` and `rotatedPath` from `read` so they are live before PH.4 (the unused-rotate-write
trigger is the only thing PH.4 adds; if your linter flags `capBytes` as unused in this task, add the
rotation in PH.4 in the same commit window — but prefer keeping the field read here as written).

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/scrollback-store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/scrollback-store.ts packages/pty/src/scrollback-store.test.ts && git commit -m "feat(pty): file scrollback store append/read + path safety (PH.3)"`

---

### Task PH.4: Rotation when the byte cap is crossed
When the running total in `<id>.bin` reaches `capBytes`, rotate (`<id>.bin` → `<id>.1.bin`, replacing any
prior `.1.bin`) and start a fresh `<id>.bin`. `read` (built in PH.3) already returns
`concat(<id>.1.bin?, <id>.bin)`, so this asserts the most-recent bytes survive across a rotation.

**Files:**
- Modify: `packages/pty/src/scrollback-store.ts` (add rotate logic inside `append`)
- Test: `packages/pty/src/scrollback-store.test.ts` (add rotation cases)

- [ ] **Step 1: Write the failing test** — add to the `createFileScrollbackStore` describe:
```ts
it("rotates at the byte cap and read returns the most-recent bytes across the rotation", () => {
  const fs = createMemoryScrollbackFs()
  // capBytes = 4: each 2-byte append fills the cap after two writes, forcing a rotation.
  const store = createFileScrollbackStore({ dir: "/scroll", fs, capBytes: 4 })
  store.append(id, enc("AA")) // main = "AA"           (2 bytes)
  store.append(id, enc("BB")) // main = "AABB" -> hits cap -> rotate: .1.bin="AABB", main=""
  store.append(id, enc("CC")) // main = "CC"
  const r = store.read(id)
  // read = concat(.1.bin, main) = "AABB" + "CC"
  expect(r.ok && dec(r.value)).toBe("AABBCC")
  expect(fs.exists("/scroll/s_00000000-0000-4000-8000-000000000000.1.bin")).toBe(true)
})

it("keeps only one rotation generation, replacing a prior .1.bin on the next rotation", () => {
  const fs = createMemoryScrollbackFs()
  const store = createFileScrollbackStore({ dir: "/scroll", fs, capBytes: 4 })
  store.append(id, enc("AABB")) // hits cap -> rotate gen1: .1.bin="AABB", main=""
  store.append(id, enc("CCDD")) // hits cap -> rotate gen2: .1.bin="CCDD" (replaces), main=""
  store.append(id, enc("EE"))
  const r = store.read(id)
  // The first generation ("AABB") is gone; only the latest rotated file + current remain.
  expect(r.ok && dec(r.value)).toBe("CCDDEE")
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/scrollback-store.test.ts`
  Expected failure: read returns `"AABBCC"`-expected but gets the un-rotated concatenation
  (`.1.bin` never created), and the second test's `read` includes the stale first generation.

- [ ] **Step 3: Implement** — add the rotate branch to `append` in `packages/pty/src/scrollback-store.ts`,
  replacing the `// Rotation trigger added in PH.4.` line:
```ts
      entry.value.bytes += chunk.length
      if (entry.value.bytes >= capBytes) {
        const closed = entry.value.writer.close()
        if (!closed.ok) return closed
        open.delete(safe.value)
        // Replace any prior rotated generation, then rotate the current file into the .1 slot.
        if (deps.fs.exists(rotatedPath(safe.value))) {
          const removed = deps.fs.unlink(rotatedPath(safe.value))
          if (!removed.ok) return removed
        }
        const renamed = deps.fs.rename(mainPath(safe.value), rotatedPath(safe.value))
        if (!renamed.ok) return renamed
        // Next append re-opens a fresh <id>.bin via writerFor (map entry already deleted).
      }
      return ok(undefined)
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/scrollback-store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/scrollback-store.ts packages/pty/src/scrollback-store.test.ts && git commit -m "feat(pty): rotate file scrollback at capBytes, keep one generation (PH.4)"`

---

### Task PH.5: `createMemoryScrollbackStore` in-memory `ScrollbackStore`
Provide a disk-free `ScrollbackStore` (distinct from the `ScrollbackFs` fake) for downstream consumers
that want durability semantics without a directory — and as a drop-in test double for the manager.

**Files:**
- Modify: `packages/pty/src/scrollback-store.ts` (add `createMemoryScrollbackStore`)
- Test: `packages/pty/src/scrollback-store.test.ts` (add a describe)

- [ ] **Step 1: Write the failing test** — add to `packages/pty/src/scrollback-store.test.ts`:
```ts
import { createMemoryScrollbackStore } from "./scrollback-store"

describe("createMemoryScrollbackStore", () => {
  it("accumulates appended chunks per session and reads them back", () => {
    const store = createMemoryScrollbackStore()
    store.append(id, enc("one"))
    store.append(id, enc("two"))
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("onetwo")
  })

  it("returns an empty buffer for an unknown session", () => {
    const store = createMemoryScrollbackStore()
    const r = store.read(id)
    expect(r.ok && r.value.length).toBe(0)
  })

  it("keeps data readable after close (durable until the process ends)", () => {
    const store = createMemoryScrollbackStore()
    store.append(id, enc("keep"))
    expect(store.close(id).ok).toBe(true)
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("keep")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/scrollback-store.test.ts`
  Expected failure: `createMemoryScrollbackStore` is not exported.

- [ ] **Step 3: Implement** — add to `packages/pty/src/scrollback-store.ts`:
```ts
/** In-memory `ScrollbackStore` fake: per-session byte buffer, no disk. Durable until process exit. */
export const createMemoryScrollbackStore = (): ScrollbackStore => {
  const bufs = new Map<string, Uint8Array>()
  return {
    append: (id, chunk): Result<void, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      bufs.set(safe.value, concatBytes(bufs.get(safe.value) ?? new Uint8Array(0), chunk))
      return ok(undefined)
    },
    read: (id): Result<Uint8Array, PtyError> => {
      const safe = safeId(id)
      if (!safe.ok) return safe
      return ok(bufs.get(safe.value) ?? new Uint8Array(0))
    },
    close: (): Result<void, PtyError> => ok(undefined),
  }
}
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/scrollback-store.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/scrollback-store.ts packages/pty/src/scrollback-store.test.ts && git commit -m "feat(pty): in-memory ScrollbackStore fake (PH.5)"`

---

### Task PH.6: Real `createBunScrollbackFs` adapter (+ store integration test)
Wire the real filesystem: Bun's `FileSink` for appends, `Bun.file().arrayBuffer()` for whole-file reads,
and `node:fs` for rename/unlink/exists. Then drive `createFileScrollbackStore` against a temp dir,
crossing a small `capBytes` to prove rotation works on real disk.

**Files:**
- Modify: `packages/pty/src/scrollback-store.ts` (add `createBunScrollbackFs`)
- Test: `packages/pty/src/scrollback-store.integration.test.ts` (real fs, temp dir)

- [ ] **Step 1: Write the failing test** — `packages/pty/src/scrollback-store.integration.test.ts`:
```ts
import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionIdSchema } from "@launchkit/types"
import { createBunScrollbackFs, createFileScrollbackStore } from "./scrollback-store"

const dec = (u: Uint8Array): string => new TextDecoder().decode(u)
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

const tempDirs: string[] = []
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lk-scroll-"))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("createBunScrollbackFs + createFileScrollbackStore (real fs)", () => {
  it("persists appended bytes to disk and reads them back through a fresh store", async () => {
    const dir = makeTempDir()
    const fs = createBunScrollbackFs()
    const store = createFileScrollbackStore({ dir, fs })
    expect(store.append(id, enc("hello ")).ok).toBe(true)
    expect(store.append(id, enc("world")).ok).toBe(true)
    expect(store.close(id).ok).toBe(true)
    // A brand-new store (no in-memory writers) must read the on-disk bytes.
    const reopened = createFileScrollbackStore({ dir, fs: createBunScrollbackFs() })
    const r = reopened.read(id)
    expect(r.ok && dec(r.value)).toBe("hello world")
  })

  it("rotates on real disk at a small cap and read returns the most-recent bytes across rotation", () => {
    const dir = makeTempDir()
    const store = createFileScrollbackStore({ dir, fs: createBunScrollbackFs(), capBytes: 8 })
    // Drive > capBytes (8): three 4-byte appends => second crosses the cap, rotating.
    store.append(id, enc("AAAA")) // main="AAAA" (4)
    store.append(id, enc("BBBB")) // main="AAAABBBB" (8) -> rotate: .1="AAAABBBB", main=""
    store.append(id, enc("CCCC")) // main="CCCC"
    const r = store.read(id)
    expect(r.ok && dec(r.value)).toBe("AAAABBBBCCCC")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/scrollback-store.integration.test.ts`
  Expected failure: `createBunScrollbackFs` is not exported from `./scrollback-store`.

- [ ] **Step 3: Implement** — add `createBunScrollbackFs` to `packages/pty/src/scrollback-store.ts`:
```ts
import { existsSync, renameSync, unlinkSync } from "node:fs"

/** Real `ScrollbackFs`: Bun FileSink for appends, Bun.file for reads, node:fs for rename/unlink. */
export const createBunScrollbackFs = (): ScrollbackFs => ({
  openAppend: (path): Result<ScrollbackAppendWriter, PtyError> => {
    try {
      // FileSink in append mode keeps adding to the existing file rather than truncating it.
      const sink = Bun.file(path).writer()
      return ok({
        write: (chunk): Result<void, PtyError> => {
          try {
            sink.write(chunk)
            // flush() makes the bytes durable promptly so a concurrent read sees recent output.
            sink.flush()
            return ok(undefined)
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause)
            return err({ kind: "scrollback-io", detail })
          }
        },
        close: (): Result<void, PtyError> => {
          try {
            sink.end()
            return ok(undefined)
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause)
            return err({ kind: "scrollback-io", detail })
          }
        },
      })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  readWhole: (path): Result<Uint8Array, PtyError> => {
    try {
      const buf = Bun.file(path).arrayBuffer() as unknown
      // Bun.file().arrayBuffer() is async; read synchronously is not available, so wrap below.
      void buf
      return err({ kind: "scrollback-io", detail: "unreachable" })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  exists: (path): boolean => existsSync(path),
  rename: (from, to): Result<void, PtyError> => {
    try {
      renameSync(from, to)
      return ok(undefined)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
  unlink: (path): Result<void, PtyError> => {
    try {
      unlinkSync(path)
      return ok(undefined)
    } catch (cause) {
      if ((cause as { code?: string }).code === "ENOENT") return ok(undefined)
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
})
```
**IMPORTANT — `readWhole` must be synchronous to match the `ScrollbackFs` interface (`read` returns a
`Result`, not a `Promise`).** `Bun.file().arrayBuffer()` is async, so the placeholder above will fail the
read test. Replace the `readWhole` body with a synchronous Node read (Bun supports `node:fs`):
```ts
  readWhole: (path): Result<Uint8Array, PtyError> => {
    try {
      const buf = readFileSync(path)
      return ok(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "scrollback-io", detail })
    }
  },
```
and extend the import to `import { existsSync, readFileSync, renameSync, unlinkSync } from "node:fs"`.
(The contract names `Bun.file().arrayBuffer()` for reads; it is async and cannot satisfy the synchronous
`Result` interface, so the real adapter uses `node:fs` `readFileSync` for the whole-file read while keeping
Bun's `FileSink` for the append path. This is the documented deviation — call it out in the commit body.)

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/scrollback-store.integration.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/scrollback-store.ts packages/pty/src/scrollback-store.integration.test.ts && git commit -m "feat(pty): real Bun ScrollbackFs adapter + temp-dir integration test (PH.6)"`

---

### Task PH.7: Export the scrollback store from the pty barrel
Make the new store + fs adapters part of `@launchkit/pty`'s public surface so the desktop composition can
import them.

**Files:**
- Modify: `packages/pty/src/index.ts:6` (add the new module export)
- Test: `packages/pty/src/index.test.ts` (create — barrel surface assertion, mirroring sessions' pattern)

- [ ] **Step 1: Write the failing test** — `packages/pty/src/index.test.ts`:
```ts
import { describe, expect, it } from "bun:test"
import * as pty from "./index"

describe("@launchkit/pty barrel", () => {
  it("exports the scrollback store factories and fs adapters", () => {
    for (const name of [
      "createFileScrollbackStore",
      "createMemoryScrollbackStore",
      "createMemoryScrollbackFs",
      "createBunScrollbackFs",
    ]) {
      expect(typeof (pty as Record<string, unknown>)[name]).toBe("function")
    }
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/index.test.ts`
  Expected failure: the four names are `undefined` (module not re-exported), so `typeof` is `"undefined"`.

- [ ] **Step 3: Implement** — add to `packages/pty/src/index.ts`:
```ts
export * from "./scrollback-store"
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/index.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/index.ts packages/pty/src/index.test.ts && git commit -m "feat(pty): export scrollback store from barrel (PH.7)"`

---

### Task PH.8: Thread `cwd` through the pty `open` path
Add `cwd?: string` to `PtyOpenOptions` and pass it to `Bun.spawn` in `createFfiPty`. The fake pty ignores
it (it has no spawn), so manager unit tests stay green.

**Files:**
- Modify: `packages/pty/src/pty.ts:16` (`PtyOpenOptions` add `cwd?`)
- Modify: `packages/pty/src/ffi-pty.ts:176` (pass `cwd` to `Bun.spawn`)
- Test: `packages/pty/src/ffi-pty.integration.test.ts` (add a cwd case, macOS-gated)

- [ ] **Step 1: Write the failing test** — add to the `describeMac` block in
  `packages/pty/src/ffi-pty.integration.test.ts`:
```ts
it("spawns the child in the requested cwd when cwd is given", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lk-pty-cwd-"))
  try {
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "pwd -P"],
      env: { ...process.env } as Record<string, string>,
      cols: 80,
      rows: 24,
      cwd: dir,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const out: string[] = []
    const exit = new Promise<number>((res) => opened.value.onExit(res))
    opened.value.onData((c) => out.push(new TextDecoder().decode(c)))
    await exit
    // realpathSync collapses /var -> /private/var so the comparison matches `pwd -P`.
    expect(out.join("")).toContain(realpathSync(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```
Add to that file's imports: `import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs"`
(it already imports `readdirSync`; widen the import) and `import { tmpdir } from "node:os"` +
`import { join } from "node:path"`.

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/ffi-pty.integration.test.ts`
  Expected failure (on macOS): TS error — `cwd` is not a known property of `PtyOpenOptions`. (On non-darwin
  the suite is `skipIf`-skipped; the typecheck gate in the phase gate still catches the type error.)

- [ ] **Step 3: Implement** —
  In `packages/pty/src/pty.ts`, add `cwd` to `PtyOpenOptions`:
```ts
export interface PtyOpenOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
}
```
  In `packages/pty/src/ffi-pty.ts`, pass `cwd` to the existing `Bun.spawn` call (add the field to its
  options object; Bun ignores an `undefined` cwd):
```ts
        const child = Bun.spawn([opts.command, ...opts.args], {
          stdio: [slaveFd, slaveFd, slaveFd],
          cwd: opts.cwd,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            ...opts.env,
          },
        })
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/ffi-pty.integration.test.ts`
  (On non-darwin the suite is skipped; rely on the typecheck gate. On macOS the new case passes.)

- [ ] **Step 5: Commit** — `git add packages/pty/src/pty.ts packages/pty/src/ffi-pty.ts packages/pty/src/ffi-pty.integration.test.ts && git commit -m "feat(pty): thread cwd through pty open into Bun.spawn (PH.8)"`

---

### Task PH.9: Thread `name`/`cwd` + the scrollback store through `createTerminalManager`
Widen `TerminalLaunchInput` with `name?`/`cwd?`; widen `SessionSink.create` to accept them and forward to
`sessions.create`; pass `cwd` to `pty.open`; add `scrollback: ScrollbackStore` to deps and tap it in
`onData`/`onExit` alongside the existing registry/session calls.

**Files:**
- Modify: `packages/pty/src/manager.ts:14` (`TerminalLaunchInput`), `:24` (`SessionSink.create`),
  `:31` (`TerminalManagerDeps`), `:66` (`spawnPty` → `pty.open`), `:84`/`:88` (data/exit taps),
  `:98` (`launch` → `sessions.create`)
- Test: `packages/pty/src/manager.test.ts` (extend `makeDeps`, add cases)

- [ ] **Step 1: Write the failing test** — extend `packages/pty/src/manager.test.ts`. First import and wire
  the store into `makeDeps` (add `import { createMemoryScrollbackStore } from "./scrollback-store"` and a
  `scrollback` field to the returned `deps`, exposing it for assertions):
```ts
// In makeDeps(): capture create() inputs and add the scrollback store.
const created: { name?: string; cwd?: string }[] = []
const scrollback = createMemoryScrollbackStore()
// ...return { sent, closed, pty, created, scrollback, deps: { ... } } with:
//   sessions: {
//     create: (input) => { created.push({ name: input.name, cwd: input.cwd }); return ok(fakeSession) },
//     close: (id, code) => { closed.push({ id, code }); return ok({ ...fakeSession, exitCode: code }) },
//   },
//   scrollback,
```
Then add these cases:
```ts
it("forwards name and cwd to sessions.create on launch", () => {
  const { deps, created } = makeDeps()
  const manager = createTerminalManager(deps)
  manager.launch({ ...launchInput, name: "my run", cwd: "/work/dir" })
  expect(created).toContainEqual({ name: "my run", cwd: "/work/dir" })
})

it("passes cwd to pty.open when the harness is spawned", () => {
  const opened: { cwd?: string }[] = []
  const { deps, pty } = makeDeps()
  const manager = createTerminalManager({
    ...deps,
    pty: { open: (opts) => { opened.push({ cwd: opts.cwd }); return ok(pty) } },
  })
  manager.launch({ ...launchInput, cwd: "/work/dir" })
  resize(manager)
  expect(opened).toEqual([{ cwd: "/work/dir" }])
})

it("taps pty output into the scrollback store alongside the registry", () => {
  const { deps, pty, scrollback } = makeDeps()
  const manager = createTerminalManager(deps)
  manager.launch(launchInput)
  resize(manager)
  pty.emit("durable")
  const r = scrollback.read(sessionId)
  expect(r.ok && decode(r.value)).toBe("durable")
})

it("closes the scrollback store when the harness exits", () => {
  const closes: string[] = []
  const { deps, pty } = makeDeps()
  const tracking = {
    append: deps.scrollback.append,
    read: deps.scrollback.read,
    close: (id: typeof sessionId) => { closes.push(id); return deps.scrollback.close(id) },
  }
  const manager = createTerminalManager({ ...deps, scrollback: tracking })
  manager.launch(launchInput)
  resize(manager)
  pty.triggerExit(0)
  expect(closes).toContain(sessionId)
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/pty/src/manager.test.ts`
  Expected failure: TS error that `scrollback` is missing from `TerminalManagerDeps` / `name`/`cwd` are not
  on `TerminalLaunchInput` or the `create` input; once typed, the tap assertions fail because `onData`
  only calls `registry.appendData` and `pty.open` ignores `cwd`.

- [ ] **Step 3: Implement** — in `packages/pty/src/manager.ts`:
  Import the store type at the top: `import type { ScrollbackStore } from "./scrollback-store"`.
  Widen `TerminalLaunchInput`:
```ts
export interface TerminalLaunchInput {
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly name?: string
  readonly cwd?: string
}
```
  Widen `SessionSink.create`'s inline input type:
```ts
export interface SessionSink {
  create(input: {
    harnessId: HarnessId
    alias: AliasName
    name?: string
    cwd?: string
  }): Result<Session, SessionError>
  close(id: SessionId, exitCode: number): Result<Session, SessionError>
}
```
  Add `scrollback` to deps:
```ts
export interface TerminalManagerDeps {
  readonly pty: PtyAdapter
  readonly sessions: SessionSink
  readonly scrollback: ScrollbackStore
  send(message: PtyOutbound): void
  readonly capBytes: number
  readonly defaultSize: { readonly cols: number; readonly rows: number }
}
```
  In `spawnPty`, pass `cwd` to `pty.open` and tap the store in the data/exit handlers:
```ts
    const handle = deps.pty.open({
      command: input.command,
      args: input.args,
      env: input.env,
      cols,
      rows,
      cwd: input.cwd,
    })
    // ...
    pty.onData((chunk) => {
      registry.appendData(id, chunk)
      deps.scrollback.append(id, chunk)
      send(encodeData(id, chunk))
    })
    pty.onExit((code) => {
      registry.markExited(id, code)
      deps.sessions.close(id, code)
      deps.scrollback.close(id)
      send(encodeExit(id, code))
    })
```
  In `launch`, forward `name`/`cwd` to `sessions.create`:
```ts
    const session = deps.sessions.create({
      harnessId: input.harnessId,
      alias: input.alias,
      name: input.name,
      cwd: input.cwd,
    })
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/pty/src/manager.test.ts`

- [ ] **Step 5: Commit** — `git add packages/pty/src/manager.ts packages/pty/src/manager.test.ts && git commit -m "feat(pty): thread name/cwd + tap scrollback store in terminal manager (PH.9)"`

---

### Task PH.10: `cwd` in the harness spawner + adapter
Add `cwd?: string` as the 4th `ProcessSpawner.spawn` parameter, record it in the recording fake, and pass
it to `Bun.spawn` in `createBunProcessSpawner`.

**Files:**
- Modify: `packages/harnesses/src/process-spawner.ts:12` (`ProcessSpawner.spawn`), `:20` (`SpawnCall`),
  `:34` (recording fake)
- Modify: `packages/harnesses/src/adapters.ts:28` (`createBunProcessSpawner`)
- Test: `packages/harnesses/src/process-spawner.test.ts` (create — recording fake records cwd) and add a
  cwd case to `packages/harnesses/src/adapters.integration.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/harnesses/src/process-spawner.test.ts`:
```ts
import { describe, expect, it } from "bun:test"
import { createRecordingProcessSpawner } from "./process-spawner"

describe("createRecordingProcessSpawner", () => {
  it("records the cwd passed to spawn", () => {
    const spawner = createRecordingProcessSpawner(7)
    spawner.spawn("/bin/echo", ["hi"], { A: "1" }, "/work/dir")
    expect(spawner.calls[0]?.cwd).toBe("/work/dir")
  })

  it("records undefined cwd when none is given", () => {
    const spawner = createRecordingProcessSpawner(7)
    spawner.spawn("/bin/echo", [], {})
    expect(spawner.calls[0]?.cwd).toBeUndefined()
  })
})
```
  And add to `packages/harnesses/src/adapters.integration.test.ts` (inside a
  `describe("createBunProcessSpawner (real)")` block — create the block if absent):
```ts
it("spawns the child process in the given cwd", async () => {
  const dir = makeTempDir()
  const out = join(dir, "where.txt")
  const spawner = createBunProcessSpawner()
  // Write the child's cwd to a file (stdio is inherited, so assert via the filesystem).
  const r = spawner.spawn("/bin/sh", ["-c", `pwd -P > ${out}`], { ...process.env } as Record<string, string>, dir)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  await r.value.exited
  const written = readFileSync(out, "utf8").trim()
  expect(written).toBe(realpathSync(dir))
})
```
  Widen that file's `node:fs` import to include `readFileSync` and `realpathSync` (it already imports
  `mkdtempSync`/`readFileSync`/`readdirSync`/`rmSync`/`writeFileSync` — add `realpathSync`).

- [ ] **Step 2: Run test, expect RED** — `bun test packages/harnesses/src/process-spawner.test.ts`
  Expected failure: TS error — `spawn` accepts only 3 args / `SpawnCall` has no `cwd` field.

- [ ] **Step 3: Implement** —
  In `packages/harnesses/src/process-spawner.ts`, add `cwd` to the interface, `SpawnCall`, and the fake:
```ts
export interface ProcessSpawner {
  spawn(
    command: string,
    args: readonly string[],
    env: Readonly<Record<string, string>>,
    cwd?: string,
  ): Result<SpawnedProcess, HarnessError>
}

export interface SpawnCall {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd?: string
}
```
  In `createRecordingProcessSpawner`, record `cwd`:
```ts
    spawn: (command, args, env, cwd): Result<SpawnedProcess, HarnessError> => {
      calls.push({ command, args, env, cwd })
      return ok({ pid, exited: Promise.resolve(exitCode) })
    },
```
  In `packages/harnesses/src/adapters.ts`, `createBunProcessSpawner`, add the `cwd` param + pass it:
```ts
export const createBunProcessSpawner = (): ProcessSpawner => ({
  spawn: (
    command: string,
    args: readonly string[],
    env: Readonly<Record<string, string>>,
    cwd?: string,
  ): Result<SpawnedProcess, HarnessError> => {
    try {
      const child = Bun.spawn([command, ...args], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["inherit", "inherit", "inherit"],
      })
      return ok({ pid: child.pid, exited: child.exited })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "spawn-failed", detail })
    }
  },
})
```

- [ ] **Step 4: Run test, expect GREEN** —
  `bun test packages/harnesses/src/process-spawner.test.ts packages/harnesses/src/adapters.integration.test.ts`

- [ ] **Step 5: Commit** — `git add packages/harnesses/src/process-spawner.ts packages/harnesses/src/adapters.ts packages/harnesses/src/process-spawner.test.ts packages/harnesses/src/adapters.integration.test.ts && git commit -m "feat(harnesses): add cwd to ProcessSpawner + Bun adapter (PH.10)"`

---

### Task PH.11: `cwd`/`env` overrides in the launch path
Add `cwd?`/`env?` to `LaunchParams`; `resolveHarnessLaunch` merges `params.env` ON TOP of the rendered
template env (params.env wins); `launchHarness` passes `cwd` through to `spawner.spawn`.

**Files:**
- Modify: `packages/harnesses/src/launch.ts:8` (`LaunchParams`), `:21` (`resolveHarnessLaunch` env merge),
  `:52` (`launchHarness` → `spawner.spawn`)
- Test: `packages/harnesses/src/launch.test.ts` (add override cases)

- [ ] **Step 1: Write the failing test** — add to `packages/harnesses/src/launch.test.ts`:
```ts
it("merges params.env on top of the rendered template env (params.env wins)", () => {
  const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
  const r = resolveHarnessLaunch({ resolver })({
    ...params,
    env: { ANTHROPIC_MODEL: "override-model", EXTRA: "1" },
  })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value.env.ANTHROPIC_MODEL).toBe("override-model") // params.env wins
  expect(r.value.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000") // template kept
  expect(r.value.env.EXTRA).toBe("1") // extra key added
})

it("passes cwd through to the spawner on launch", () => {
  const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
  const spawner = createRecordingProcessSpawner(5)
  const r = launchHarness({ resolver, spawner })({ ...params, cwd: "/work/dir" })
  expect(r.ok).toBe(true)
  expect(spawner.calls[0]?.cwd).toBe("/work/dir")
})

it("spawns with the merged env when params.env is given", () => {
  const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
  const spawner = createRecordingProcessSpawner(5)
  launchHarness({ resolver, spawner })({ ...params, env: { EXTRA: "yes" } })
  expect(spawner.calls[0]?.env.EXTRA).toBe("yes")
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/harnesses/src/launch.test.ts`
  Expected failure: TS error — `env`/`cwd` are not on `LaunchParams`; once typed, the merge assertion fails
  (template env is returned unmerged) and `spawner.calls[0].cwd` is `undefined`.

- [ ] **Step 3: Implement** — in `packages/harnesses/src/launch.ts`:
  Widen `LaunchParams`:
```ts
export interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly proxyUrl: string
  readonly proxyKey: string
  readonly model: AliasName
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}
```
  In `resolveHarnessLaunch`, after building `env` from the template, merge `params.env` on top:
```ts
    // params.env WINS over the rendered template env (callers can override / add vars at launch).
    const merged: Record<string, string> = { ...env, ...(params.env ?? {}) }
    return ok({ command: resolved.value, args: [], env: merged })
```
  In `launchHarness`, pass `params.cwd` to the spawner:
```ts
    return deps.spawner.spawn(command, [...args], env, params.cwd)
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/harnesses/src/launch.test.ts`

- [ ] **Step 5: Commit** — `git add packages/harnesses/src/launch.ts packages/harnesses/src/launch.test.ts && git commit -m "feat(harnesses): cwd/env launch overrides, params.env wins (PH.11)"`

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green.
## Phase 4 — `@launchkit/ipc`: profiles CRUD, `pickFolder`, `getSessionScrollback`, extended launch/session params

**Scope:** `packages/ipc/src` ONLY. Add new method schemas (`getProfiles`, `addProfile`, `updateProfile`, `deleteProfile`, `pickFolder`, `getSessionScrollback`) to the `IpcMethodSchemas` map; extend `LaunchHarnessParamsSchema` and `GetSessionsParamsSchema`; the `IpcHandlers` type (server.ts) and `IpcClient` (client.ts) are derived from the map, so they extend automatically — each task asserts both the schema parse behaviour AND a client↔server round-trip over `createMemoryTransportPair`. Desktop-side handler IMPLEMENTATIONS are a separate phase. All work is TDD (RED → GREEN → REFACTOR) with `bun test` (Jest API via `bun:test`).

**Depends on:** Phase 1 (`@launchkit/types`) MUST be merged first — it adds `ProfileIdSchema`/`ProfileId`, `ProfileSchema`/`Profile`, and optional `name`/`cwd` on `SessionSchema`. These are imported here; without them every task fails to compile.

**Conventions locked from existing code (mirror exactly):**
- Every method lives in `IpcMethodSchemas` as `{ params, result }`; the name set, `IpcMethods` type, `IpcHandlers` type, and `IpcClient` type are all DERIVED from that map (`createIpcClient`/`createIpcServer` iterate `Object.keys(IpcMethodSchemas)`). Adding a map entry is the entire registration — no manual wiring in client.ts/server.ts.
- Param/result schemas are `export const XParamsSchema`/`XResultSchema`, object schemas end in `.strict()`, string-maps are `z.record(z.string(), z.string())`.
- `void` over the wire is `null` (`const VoidSchema = z.null()` at `packages/ipc/src/methods.ts:15`). Delete methods (`deleteProvider` at :51, `deleteAlias` at :98, `deleteHarness` at :120) all resolve to `VoidSchema`.
- **`add` with a MINTED id omits the id from params.** `AddProviderParamsSchema` (`methods.ts:37`) = `ProviderMutationInputSchema` (`:27`), a `.strict()` body with NO `id` — the server mints the `ProviderId`. A `Profile`'s `id` is minted the same way (it is not a user-chosen natural key like an alias name or harness id), so `addProfile` mirrors `addProvider`: **params `ProfileSchema.omit({ id: true }).strict()`, result `ProfileSchema`** (server mints the id). `updateProfile` takes the FULL `ProfileSchema` (id included) like the alias/harness update bodies carry their key.
- Schema-parse tests import the schema directly; round-trip tests build `createMemoryTransportPair()`, wire a `Pick<IpcHandlers, "...">` cast to `IpcHandlers` into `createIpcServer`, build a client with `createIpcClient(pair.client)`, and assert the returned `Result` (`{ ok: true, value }`). Use `as` casts to branded ids in fixtures (e.g. `"prof_1" as ProfileId`).

**Branded-fixture note:** `ProfileSchema`/`SessionSchema` use branded ids; cast string literals with `as ProfileId` / `as SessionId` / `as HarnessId` / `as AliasName` from `@launchkit/types` exactly as `methods.test.ts` already does for `HarnessId`/`AliasName`.

---

### Task I.1: `getProfiles` — list all profiles

**Files:**
- Modify: `packages/ipc/src/methods.ts` (add a `// ── Profiles ──` section after the Harnesses block ending at :134; add the map entry inside `IpcMethodSchemas` at :235)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe` block) and `packages/ipc/src/profiles.round-trip.test.ts` (new file)

- [ ] **Step 1: Write the failing test** — append to `packages/ipc/src/methods.test.ts` (add `GetProfilesParamsSchema`, `GetProfilesResultSchema` to the import from `./methods`, and add `"getProfiles"` to the `expected` array inside the existing `IpcMethodSchemas` describe at :95). Add this describe block:

```ts
import type { Profile, ProfileId } from "@launchkit/types"
import { GetProfilesParamsSchema, GetProfilesResultSchema } from "./methods"

const sampleProfile: Profile = {
  id: "prof_default" as ProfileId,
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("GetProfilesParamsSchema", () => {
  it("parses undefined params", () => {
    expect(GetProfilesParamsSchema.parse(undefined)).toBeUndefined()
  })
})

describe("GetProfilesResultSchema", () => {
  it("parses an array of profiles", () => {
    expect(GetProfilesResultSchema.parse([sampleProfile])).toEqual([
      sampleProfile,
    ])
  })
  it("rejects a non-array result", () => {
    expect(GetProfilesResultSchema.safeParse({}).success).toBe(false)
  })
})
```

And create `packages/ipc/src/profiles.round-trip.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import type { Profile, ProfileId } from "@launchkit/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

const sampleProfile: Profile = {
  id: "prof_default" as ProfileId,
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("getProfiles round-trip", () => {
  it("returns the profile list through the memory transport pair", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProfiles"> = {
      getProfiles: async () => [sampleProfile],
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getProfiles(undefined)
    expect(r).toEqual({ ok: true, value: [sampleProfile] })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'GetProfilesParamsSchema' not found in module '.../packages/ipc/src/methods.ts'` (schemas not exported), and in the round-trip file `Property 'getProfiles' does not exist on type 'IpcClient'` / `IpcHandlers` (the map has no `getProfiles` key yet).

- [ ] **Step 3: Implement** — in `packages/ipc/src/methods.ts`, add the `Profile` import to the existing `@launchkit/types` import block (line 1–10), add a Profiles section after the Harnesses block (before the `// ── Sessions & proxy ──` comment at :136), and register the method in `IpcMethodSchemas` (after the `launchHarness` entry at :222). Add to the import:

```ts
import {
  AliasNameSchema,
  HarnessDefinitionSchema,
  HarnessIdSchema,
  ModelAliasSchema,
  ProfileSchema,
  ProviderIdSchema,
  SdkProviderSchema,
  SessionIdSchema,
  SessionSchema,
} from "@launchkit/types"
```

New section:

```ts
// ── Profiles ───────────────────────────────────────────────────────────────

export const GetProfilesParamsSchema = z.undefined()
export const GetProfilesResultSchema = z.array(ProfileSchema)
```

New map entry (inside `IpcMethodSchemas`):

```ts
  getProfiles: {
    params: GetProfilesParamsSchema,
    result: GetProfilesResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts && git commit -m "feat(ipc): add getProfiles method schema (I.1)"`

---

### Task I.2: `addProfile` — create a profile (id minted server-side)

**Files:**
- Modify: `packages/ipc/src/methods.ts` (Profiles section; map entry after `getProfiles`)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe`) and `packages/ipc/src/profiles.round-trip.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** — add `AddProfileParamsSchema`, `AddProfileResultSchema` to the `./methods` import in `methods.test.ts` and add this describe (note: params OMIT `id`, mirroring `addProvider`):

```ts
import { AddProfileParamsSchema, AddProfileResultSchema } from "./methods"

const profileInput = {
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("AddProfileParamsSchema", () => {
  it("parses a profile input without an id (server mints it)", () => {
    expect(AddProfileParamsSchema.parse(profileInput)).toEqual(profileInput)
  })
  it("rejects an input that supplies an id", () => {
    expect(
      AddProfileParamsSchema.safeParse({ ...profileInput, id: "prof_x" })
        .success,
    ).toBe(false)
  })
  it("rejects an input with an empty name", () => {
    expect(
      AddProfileParamsSchema.safeParse({ ...profileInput, name: "" }).success,
    ).toBe(false)
  })
})

describe("AddProfileResultSchema", () => {
  it("parses a full profile carrying the minted id", () => {
    expect(AddProfileResultSchema.parse(sampleProfile)).toEqual(sampleProfile)
  })
})
```

Add a round-trip case in `profiles.round-trip.test.ts`:

```ts
describe("addProfile round-trip", () => {
  it("sends an id-less input and returns the minted profile", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "addProfile"> = {
      addProfile: async (input) => ({
        ...input,
        id: "prof_minted" as ProfileId,
      }),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.addProfile({
      name: "Default",
      harnessId: "claude" as Profile["harnessId"],
      alias: "default" as Profile["alias"],
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
    expect(r).toEqual({
      ok: true,
      value: {
        id: "prof_minted" as ProfileId,
        name: "Default",
        harnessId: "claude" as Profile["harnessId"],
        alias: "default" as Profile["alias"],
        env: { ANTHROPIC_MODEL: "sonnet" },
      },
    })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'AddProfileParamsSchema' not found in module '.../packages/ipc/src/methods.ts'`, and `Property 'addProfile' does not exist on type 'IpcClient'`.

- [ ] **Step 3: Implement** — in the Profiles section of `methods.ts`, add the schemas and register the method after `getProfiles`:

```ts
export const AddProfileParamsSchema = ProfileSchema.omit({ id: true }).strict()
export const AddProfileResultSchema = ProfileSchema
```

Map entry:

```ts
  addProfile: {
    params: AddProfileParamsSchema,
    result: AddProfileResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts && git commit -m "feat(ipc): add addProfile method schema, id minted server-side (I.2)"`

---

### Task I.3: `updateProfile` — update a profile by full body

**Files:**
- Modify: `packages/ipc/src/methods.ts` (Profiles section; map entry after `addProfile`)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe`) and `packages/ipc/src/profiles.round-trip.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** — add `UpdateProfileParamsSchema`, `UpdateProfileResultSchema` to the `./methods` import in `methods.test.ts` and add:

```ts
import { UpdateProfileParamsSchema, UpdateProfileResultSchema } from "./methods"

describe("UpdateProfileParamsSchema", () => {
  it("parses a full profile (id included)", () => {
    expect(UpdateProfileParamsSchema.parse(sampleProfile)).toEqual(
      sampleProfile,
    )
  })
  it("rejects a profile missing its id", () => {
    expect(
      UpdateProfileParamsSchema.safeParse({
        name: "Default",
        harnessId: "claude" as Profile["harnessId"],
        alias: "default" as Profile["alias"],
        env: {},
      }).success,
    ).toBe(false)
  })
})

describe("UpdateProfileResultSchema", () => {
  it("parses the updated profile", () => {
    expect(UpdateProfileResultSchema.parse(sampleProfile)).toEqual(
      sampleProfile,
    )
  })
})
```

Add a round-trip case in `profiles.round-trip.test.ts`:

```ts
describe("updateProfile round-trip", () => {
  it("sends a full profile and returns the updated profile", async () => {
    const pair = createMemoryTransportPair()
    const updated: Profile = { ...sampleProfile, name: "Renamed" }
    const handlers: Pick<IpcHandlers, "updateProfile"> = {
      updateProfile: async () => updated,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.updateProfile(sampleProfile)
    expect(r).toEqual({ ok: true, value: updated })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'UpdateProfileParamsSchema' not found`, and `Property 'updateProfile' does not exist on type 'IpcClient'`.

- [ ] **Step 3: Implement** — in the Profiles section of `methods.ts`, add the schemas and register after `addProfile`:

```ts
export const UpdateProfileParamsSchema = ProfileSchema
export const UpdateProfileResultSchema = ProfileSchema
```

Map entry:

```ts
  updateProfile: {
    params: UpdateProfileParamsSchema,
    result: UpdateProfileResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts && git commit -m "feat(ipc): add updateProfile method schema (I.3)"`

---

### Task I.4: `deleteProfile` — delete a profile by id (void result)

**Files:**
- Modify: `packages/ipc/src/methods.ts` (Profiles section; map entry after `updateProfile`)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe`) and `packages/ipc/src/profiles.round-trip.test.ts` (add a case)

- [ ] **Step 1: Write the failing test** — add `DeleteProfileParamsSchema`, `DeleteProfileResultSchema` to the `./methods` import in `methods.test.ts` and add (result is `VoidSchema` → `null`, matching `deleteProvider`/`deleteAlias`):

```ts
import { DeleteProfileParamsSchema, DeleteProfileResultSchema } from "./methods"

describe("DeleteProfileParamsSchema", () => {
  it("parses an object carrying the profile id", () => {
    expect(
      DeleteProfileParamsSchema.parse({ id: "prof_default" as ProfileId }),
    ).toEqual({ id: "prof_default" as ProfileId })
  })
  it("rejects extra keys", () => {
    expect(
      DeleteProfileParamsSchema.safeParse({
        id: "prof_default" as ProfileId,
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("DeleteProfileResultSchema", () => {
  it("parses null (void) as the result", () => {
    expect(DeleteProfileResultSchema.parse(null)).toBeNull()
  })
})
```

Add a round-trip case in `profiles.round-trip.test.ts`:

```ts
describe("deleteProfile round-trip", () => {
  it("sends the id and returns Ok(null)", async () => {
    const pair = createMemoryTransportPair()
    let deletedId: string | undefined
    const handlers: Pick<IpcHandlers, "deleteProfile"> = {
      deleteProfile: async (params) => {
        deletedId = params.id
        return null
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.deleteProfile({ id: "prof_default" as ProfileId })
    expect(r).toEqual({ ok: true, value: null })
    expect(deletedId).toBe("prof_default")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'DeleteProfileParamsSchema' not found`, and `Property 'deleteProfile' does not exist on type 'IpcClient'`.

- [ ] **Step 3: Implement** — in the Profiles section of `methods.ts`, add the schemas (reusing the file-level `VoidSchema`) and register after `updateProfile`. `ProfileIdSchema` must be added to the `@launchkit/types` import block:

```ts
import {
  AliasNameSchema,
  HarnessDefinitionSchema,
  HarnessIdSchema,
  ModelAliasSchema,
  ProfileIdSchema,
  ProfileSchema,
  ProviderIdSchema,
  SdkProviderSchema,
  SessionIdSchema,
  SessionSchema,
} from "@launchkit/types"
```

Schemas:

```ts
export const DeleteProfileParamsSchema = z
  .object({ id: ProfileIdSchema })
  .strict()
export const DeleteProfileResultSchema = VoidSchema
```

Map entry:

```ts
  deleteProfile: {
    params: DeleteProfileParamsSchema,
    result: DeleteProfileResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/profiles.round-trip.test.ts && git commit -m "feat(ipc): add deleteProfile method schema (void result) (I.4)"`

---

### Task I.5: `pickFolder` — native folder picker

**Files:**
- Modify: `packages/ipc/src/methods.ts` (add a `// ── Dialogs ──` section after the Sessions & proxy block; map entry after `deleteProfile`)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe`) and `packages/ipc/src/dialogs.round-trip.test.ts` (new file)

- [ ] **Step 1: Write the failing test** — add `PickFolderParamsSchema`, `PickFolderResultSchema` to the `./methods` import in `methods.test.ts` and add (both params and the inner `path` are optional — params can be omitted entirely, and a cancelled dialog returns `{}`):

```ts
import { PickFolderParamsSchema, PickFolderResultSchema } from "./methods"

describe("PickFolderParamsSchema", () => {
  it("parses omitted params (undefined)", () => {
    expect(PickFolderParamsSchema.parse(undefined)).toBeUndefined()
  })
  it("parses a starting folder hint", () => {
    expect(PickFolderParamsSchema.parse({ startingFolder: "/Users/fred" })).toEqual(
      { startingFolder: "/Users/fred" },
    )
  })
  it("rejects extra keys", () => {
    expect(
      PickFolderParamsSchema.safeParse({ startingFolder: "/x", extra: 1 })
        .success,
    ).toBe(false)
  })
})

describe("PickFolderResultSchema", () => {
  it("parses a chosen path", () => {
    expect(PickFolderResultSchema.parse({ path: "/Users/fred/app" })).toEqual({
      path: "/Users/fred/app",
    })
  })
  it("parses an empty object (dialog cancelled)", () => {
    expect(PickFolderResultSchema.parse({})).toEqual({})
  })
})
```

Create `packages/ipc/src/dialogs.round-trip.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("pickFolder round-trip", () => {
  it("returns the chosen path when the dialog confirms", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "pickFolder"> = {
      pickFolder: async () => ({ path: "/Users/fred/app" }),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.pickFolder({ startingFolder: "/Users/fred" })
    expect(r).toEqual({ ok: true, value: { path: "/Users/fred/app" } })
  })

  it("returns an empty path object when the dialog is cancelled", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "pickFolder"> = {
      pickFolder: async () => ({}),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.pickFolder(undefined)
    expect(r).toEqual({ ok: true, value: {} })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/dialogs.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'PickFolderParamsSchema' not found`, and `Property 'pickFolder' does not exist on type 'IpcClient'`.

- [ ] **Step 3: Implement** — in `methods.ts`, add a Dialogs section after the Sessions & proxy block (after `GetTerminalSocketUrlResultSchema` at :160) and register after `deleteProfile`:

```ts
// ── Dialogs ────────────────────────────────────────────────────────────────

// Native folder picker. Params (and the starting hint) are optional; a cancelled
// dialog resolves to `{}` (no `path`), never an error.
export const PickFolderParamsSchema = z
  .object({ startingFolder: z.string().optional() })
  .strict()
  .optional()
export const PickFolderResultSchema = z
  .object({ path: z.string().optional() })
  .strict()
```

Map entry:

```ts
  pickFolder: {
    params: PickFolderParamsSchema,
    result: PickFolderResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/dialogs.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/dialogs.round-trip.test.ts && git commit -m "feat(ipc): add pickFolder method schema (I.5)"`

---

### Task I.6: `getSessionScrollback` — fetch a session's terminal scrollback

**Files:**
- Modify: `packages/ipc/src/methods.ts` (Sessions & proxy section, after `GetSessionsResultSchema` at :145; map entry after `getSessions`)
- Test: `packages/ipc/src/methods.test.ts` (add a `describe`) and `packages/ipc/src/sessions.round-trip.test.ts` (new file)

- [ ] **Step 1: Write the failing test** — add `GetSessionScrollbackParamsSchema`, `GetSessionScrollbackResultSchema` to the `./methods` import in `methods.test.ts` and add (scrollback bytes travel base64-encoded as a string):

```ts
import type { SessionId } from "@launchkit/types"
import {
  GetSessionScrollbackParamsSchema,
  GetSessionScrollbackResultSchema,
} from "./methods"

describe("GetSessionScrollbackParamsSchema", () => {
  it("parses an object carrying the session id", () => {
    expect(
      GetSessionScrollbackParamsSchema.parse({ id: "s_1" as SessionId }),
    ).toEqual({ id: "s_1" as SessionId })
  })
  it("rejects extra keys", () => {
    expect(
      GetSessionScrollbackParamsSchema.safeParse({
        id: "s_1" as SessionId,
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("GetSessionScrollbackResultSchema", () => {
  it("parses a base64 byte payload", () => {
    expect(
      GetSessionScrollbackResultSchema.parse({ bytesBase64: "aGk=" }),
    ).toEqual({ bytesBase64: "aGk=" })
  })
  it("rejects a result missing bytesBase64", () => {
    expect(GetSessionScrollbackResultSchema.safeParse({}).success).toBe(false)
  })
})
```

Create `packages/ipc/src/sessions.round-trip.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import type { SessionId } from "@launchkit/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

describe("getSessionScrollback round-trip", () => {
  it("returns the base64 scrollback for the requested session", async () => {
    const pair = createMemoryTransportPair()
    let askedId: string | undefined
    const handlers: Pick<IpcHandlers, "getSessionScrollback"> = {
      getSessionScrollback: async (params) => {
        askedId = params.id
        return { bytesBase64: "aGVsbG8=" }
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getSessionScrollback({ id: "s_42" as SessionId })
    expect(r).toEqual({ ok: true, value: { bytesBase64: "aGVsbG8=" } })
    expect(askedId).toBe("s_42")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts`
  Expected failure: `SyntaxError: Export named 'GetSessionScrollbackParamsSchema' not found`, and `Property 'getSessionScrollback' does not exist on type 'IpcClient'`.

- [ ] **Step 3: Implement** — in the Sessions & proxy section of `methods.ts`, add the schemas after `GetSessionsResultSchema` (:145) and register the method after `getSessions` (:226). `SessionIdSchema` is already imported (`methods.ts:8`):

```ts
// Scrollback bytes are base64-encoded for JSON transport (binary-safe over IPC).
export const GetSessionScrollbackParamsSchema = z
  .object({ id: SessionIdSchema })
  .strict()
export const GetSessionScrollbackResultSchema = z
  .object({ bytesBase64: z.string() })
  .strict()
```

Map entry:

```ts
  getSessionScrollback: {
    params: GetSessionScrollbackParamsSchema,
    result: GetSessionScrollbackResultSchema,
  },
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts && git commit -m "feat(ipc): add getSessionScrollback method schema (I.6)"`

---

### Task I.7: Extend `LaunchHarnessParams` (name/cwd/env) and `GetSessionsParams` (running/limit/offset)

**Files:**
- Modify: `packages/ipc/src/methods.ts:122` (`LaunchHarnessParamsSchema`) and `packages/ipc/src/methods.ts:138` (`GetSessionsParamsSchema`)
- Test: `packages/ipc/src/methods.test.ts` (extend the existing `LaunchHarnessParamsSchema` and `GetSessionsParamsSchema` describe blocks at :56 and :82) and `packages/ipc/src/sessions.round-trip.test.ts` (add cases)

- [ ] **Step 1: Write the failing test** — extend the existing describe blocks in `methods.test.ts`. Add these cases inside the existing `describe("LaunchHarnessParamsSchema", ...)` (:56):

```ts
  it("parses launch params with name, cwd, and env", () => {
    expect(
      LaunchHarnessParamsSchema.parse({
        id: "claude" as HarnessId,
        alias: "fast" as AliasName,
        name: "My run",
        cwd: "/Users/fred/projects/app",
        env: { ANTHROPIC_MODEL: "sonnet" },
      }),
    ).toEqual({
      id: "claude" as HarnessId,
      alias: "fast" as AliasName,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("rejects an env whose values are not strings", () => {
    expect(
      LaunchHarnessParamsSchema.safeParse({
        id: "claude" as HarnessId,
        env: { PORT: 8080 },
      }).success,
    ).toBe(false)
  })
```

And add these cases inside the existing `describe("GetSessionsParamsSchema", ...)` (:82):

```ts
  it("parses a filter narrowing by running, limit, and offset", () => {
    expect(
      GetSessionsParamsSchema.parse({ running: true, limit: 20, offset: 0 }),
    ).toEqual({ running: true, limit: 20, offset: 0 })
  })
  it("rejects a non-positive limit", () => {
    expect(GetSessionsParamsSchema.safeParse({ limit: 0 }).success).toBe(false)
  })
  it("rejects a negative offset", () => {
    expect(GetSessionsParamsSchema.safeParse({ offset: -1 }).success).toBe(
      false,
    )
  })
```

Add round-trip cases to `packages/ipc/src/sessions.round-trip.test.ts` (extend the imports it already has):

```ts
import type { HarnessId, Session } from "@launchkit/types"

describe("launchHarness round-trip with extended params", () => {
  it("forwards name/cwd/env and returns the created sessionId", async () => {
    const pair = createMemoryTransportPair()
    let received:
      | { name?: string; cwd?: string; env?: Record<string, string> }
      | undefined
    const handlers: Pick<IpcHandlers, "launchHarness"> = {
      launchHarness: async (params) => {
        received = params
        return { sessionId: "s_new" as SessionId }
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.launchHarness({
      id: "claude" as HarnessId,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
    expect(r).toEqual({ ok: true, value: { sessionId: "s_new" as SessionId } })
    expect(received).toEqual({
      id: "claude" as HarnessId,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
})

describe("getSessions round-trip with paging filter", () => {
  it("forwards running/limit/offset and returns the session list", async () => {
    const pair = createMemoryTransportPair()
    const session: Session = {
      id: "s_1" as SessionId,
      harnessId: "claude" as HarnessId,
      alias: "default" as Session["alias"],
      startedAt: "2026-05-23T10:00:00.000Z",
    }
    let filter: unknown
    const handlers: Pick<IpcHandlers, "getSessions"> = {
      getSessions: async (params) => {
        filter = params
        return [session]
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getSessions({ running: true, limit: 20, offset: 0 })
    expect(r).toEqual({ ok: true, value: [session] })
    expect(filter).toEqual({ running: true, limit: 20, offset: 0 })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts`
  Expected failure: the schema-parse cases fail because `.strict()` strips/rejects the new keys (e.g. `parses launch params with name, cwd, and env` returns an object without `name`/`cwd`/`env`, and `parses a filter narrowing by running, limit, and offset` returns `{}`); TypeScript also reports the new properties do not exist on the param types in the round-trip file.

- [ ] **Step 3: Implement** — in `methods.ts`, extend the two schemas. `LaunchHarnessParamsSchema` (:122) becomes:

```ts
export const LaunchHarnessParamsSchema = z
  .object({
    id: HarnessIdSchema,
    alias: AliasNameSchema.optional(),
    name: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict()
```

`GetSessionsParamsSchema` (:138) becomes:

```ts
export const GetSessionsParamsSchema = z
  .object({
    harnessId: HarnessIdSchema.optional(),
    alias: AliasNameSchema.optional(),
    running: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict()
  .optional()
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ipc/src/methods.ts packages/ipc/src/methods.test.ts packages/ipc/src/sessions.round-trip.test.ts && git commit -m "feat(ipc): extend launchHarness and getSessions params (I.7)"`

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green.
## Phase 5 — `@launchkit/cli`: profile commands + `launch --profile/--name/--cwd`

**Scope:** `packages/cli/src`. Add CLI parity for the new profile feature: `list profiles`, `add profile`, `remove profile`, and extend `launch` to read `--profile`, `--name`, `--cwd` (alongside the existing `--model`). All work is TDD (RED → GREEN → REFACTOR) using `bun test` (Jest API via `bun:test`).

**Depends on (FROZEN — assume earlier phases shipped these exact symbols):**
- `@launchkit/types`: `Profile` / `ProfileSchema` (shape `{ id, name, harnessId, alias, env }`, `.strict()`).
- `@launchkit/config`: `Config.profiles: Profile[]`; `defaultConfig()` returns `profiles: []`.
- `@launchkit/sessions`: `SessionInput` has optional `name?: string` / `cwd?: string`; `Session` carries optional `name`/`cwd` (so `query()` round-trips them).
- `@launchkit/harnesses`: `LaunchParams` has optional `cwd?: string` / `env?: Readonly<Record<string, string>>`.

**Conventions locked from existing code (mirror exactly):**
- Commands are PURE functions over injected `CliDeps`; they NEVER throw — every result is `Result<void, CliError>` (`@launchkit/utils` `ok`/`err`/`isErr`).
- `CliError` kinds are only `"unknown-command" | "usage" | "failed"` (`packages/cli/src/errors.ts`). Use `kind: "usage"` for bad/missing input, `kind: "failed"` for load/save/conflict/not-found.
- Tests import `{ describe, expect, it } from "bun:test"`, build deps with `makeFakeDeps(...)` from `./test-support`, and drive the CLI with `runCli(deps)(argv)` from `./run`. Assert side effects via `await deps.config.load()`, `deps.sessions.query()`, and the recorded `out.lines` (`createMemoryWriter()` from `./writer`).
- `parse-args.ts` is UNCHANGED: it already collects `--key value` / bare `--flag` into `flags: Record<string, string | boolean>`. Handlers just read the new flags off `flags`.
- `CliDeps` is UNCHANGED — no new dep field is added in this phase.
- `add`/`remove`/`list` dispatch on `rest[0]` via a `switch (target)`; new subcommands add a `case "profile":` / `case "profiles":`.

---

### Task C.1: `list profiles` — print one line per profile

**Files:**
- Modify: `packages/cli/src/list.ts` (add a `listProfiles` helper after `listAliases` at :40; add `case "profiles":` to the `switch` at :48; add `"profiles"` to `LIST_TARGETS` at :5)
- Test: `packages/cli/src/list-command.test.ts` (NEW)

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/list-command.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"
import { createMemoryWriter } from "./writer"

const seededWithProfiles = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_default" as never,
      name: "Default" as const,
      harnessId: "claude" as never,
      alias: "default" as never,
      env: {},
    },
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "codex" as never,
      alias: "fast" as never,
      env: { OPENAI_BASE_URL: "x" },
    },
  ],
})

describe("list profiles", () => {
  it("writes one tab-delimited line per profile with id, name and [harness · alias]", async () => {
    const out = createMemoryWriter()
    const deps = makeFakeDeps({ out, initialConfig: seededWithProfiles() })

    const result = await runCli(deps)(["list", "profiles"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(out.lines).toEqual([
      "prof_default\tDefault\t[claude · default]",
      "prof_fast\tFast\t[codex · fast]",
    ])
  })

  it("writes nothing when there are no profiles", async () => {
    const out = createMemoryWriter()
    const deps = makeFakeDeps({ out, initialConfig: defaultConfig() })

    const result = await runCli(deps)(["list", "profiles"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(out.lines).toEqual([])
  })

  it("returns a usage error for an unknown list target", async () => {
    const result = await runCli(makeFakeDeps())(["list", "widgets"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/list-command.test.ts`
  Expected failure: the first case fails — `list profiles` hits the `default` branch of the `switch` and returns `{ ok: false, error: { kind: "usage", detail: "list <harnesses|providers|aliases>" } }`, so `result` is not `{ ok: true, value: undefined }` and `out.lines` is `[]` instead of the two expected lines.

- [ ] **Step 3: Implement** — in `packages/cli/src/list.ts`: add `"profiles"` to `LIST_TARGETS`, add a `listProfiles` helper mirroring `listAliases`, and wire `case "profiles":`. The full file becomes:

```ts
import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

const LIST_TARGETS = ["harnesses", "providers", "aliases", "profiles"] as const

const listHarnesses = async (
  deps: CliDeps,
): Promise<Result<void, CliError>> => {
  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })
  for (const h of listed.value) {
    deps.out.write(`${h.id}\t${h.name}\t(${h.apiFormat})`)
  }
  return ok(undefined)
}

const listProviders = async (
  deps: CliDeps,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const p of loaded.value.providers) {
    // SECURITY: print only non-secret identity — never `p.secrets` (the keychain refs).
    deps.out.write(`${p.id}\t${p.name}\t[${p.sdkProvider}]`)
  }
  return ok(undefined)
}

const listAliases = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const a of loaded.value.aliases) {
    deps.out.write(`${a.alias}\t-> ${a.providerId} / ${a.providerModel}`)
  }
  return ok(undefined)
}

const listProfiles = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  for (const p of loaded.value.profiles) {
    deps.out.write(`${p.id}\t${p.name}\t[${p.harnessId} · ${p.alias}]`)
  }
  return ok(undefined)
}

/** `list harnesses | providers | aliases | profiles`. */
export const list = async (
  deps: CliDeps,
  rest: readonly string[],
): Promise<Result<void, CliError>> => {
  const target = rest[0]
  switch (target) {
    case "harnesses":
      return listHarnesses(deps)
    case "providers":
      return listProviders(deps)
    case "aliases":
      return listAliases(deps)
    case "profiles":
      return listProfiles(deps)
    default:
      return err({ kind: "usage", detail: `list <${LIST_TARGETS.join("|")}>` })
  }
}
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/list-command.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/list.ts packages/cli/src/list-command.test.ts && git commit -m "feat(cli): list profiles (C.1)"`

---

### Task C.2: `splitEnv` helper — parse `--env K=V,K2=V2` into a string map

**Files:**
- Modify: `packages/cli/src/mutate-command.ts` (add `splitEnv` after `splitModels` at :34)
- Test: `packages/cli/src/split-env.test.ts` (NEW)

> `splitEnv` is exported so it can be unit-tested in isolation (mirrors nothing existing — `splitModels` is private, but env parsing has edge cases — `=` in values, missing `=`, empty entries — that warrant a focused test). It is consumed by `addProfile` in C.3.

**`splitEnv` signature:** `export const splitEnv = (flags: Readonly<Record<string, string | boolean>>): Record<string, string>`. Reads `flags.env`; returns `{}` when absent/non-string. Splits on `,`, then each entry on the FIRST `=` (so values may contain `=`); trims the key; drops entries with an empty key or no `=`.

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/split-env.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { splitEnv } from "./mutate-command"

describe("splitEnv", () => {
  it("parses a comma list of K=V pairs into a string map", () => {
    expect(splitEnv({ env: "A=1,B=two" })).toEqual({ A: "1", B: "two" })
  })

  it("returns an empty map when --env is absent", () => {
    expect(splitEnv({})).toEqual({})
  })

  it("returns an empty map when --env is a bare boolean flag", () => {
    expect(splitEnv({ env: true })).toEqual({})
  })

  it("keeps '=' inside a value by splitting on the first '=' only", () => {
    expect(splitEnv({ env: "URL=https://x/?a=b" })).toEqual({
      URL: "https://x/?a=b",
    })
  })

  it("trims keys and drops entries with an empty key or no '='", () => {
    expect(splitEnv({ env: " A = 1 ,,NOPE,=2,B=3" })).toEqual({
      A: " 1 ",
      B: "3",
    })
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/split-env.test.ts`
  Expected failure: `SyntaxError: Export named 'splitEnv' not found in module '.../packages/cli/src/mutate-command.ts'` (the binding is undefined — `splitEnv` is not yet exported).

- [ ] **Step 3: Implement** — in `packages/cli/src/mutate-command.ts`, add `splitEnv` immediately after `splitModels` (after :34):

```ts
/**
 * Parse `--env K=V,K2=V2` into a string map. Splits on `,`, then each entry on the
 * FIRST `=` (values may contain `=`); trims the key; drops entries with an empty key
 * or no `=`. Returns `{}` when the flag is absent or a bare boolean.
 */
export const splitEnv = (
  flags: Readonly<Record<string, string | boolean>>,
): Record<string, string> => {
  const value = flags.env
  if (typeof value !== "string") return {}
  const out: Record<string, string> = {}
  for (const entry of value.split(",")) {
    const eq = entry.indexOf("=")
    if (eq <= 0) continue
    const key = entry.slice(0, eq).trim()
    if (key.length === 0) continue
    out[key] = entry.slice(eq + 1)
  }
  return out
}
```

> Note `eq <= 0` rejects both "no `=`" (`indexOf` returns `-1`) and a leading `=` with no key (`indexOf` returns `0`); the post-trim `key.length === 0` guard also rejects a whitespace-only key.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/split-env.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/mutate-command.ts packages/cli/src/split-env.test.ts && git commit -m "feat(cli): splitEnv flag parser (C.2)"`

---

### Task C.3: `add profile` — validate, conflict-check, append, save

**Files:**
- Modify: `packages/cli/src/mutate-command.ts` (add `addProfile` after `addAlias` at :117; add `case "profile":` to the `add` dispatcher's `switch` at :130, and update its `default` usage detail)
- Test: `packages/cli/src/add-profile.test.ts` (NEW)

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/add-profile.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

describe("add profile", () => {
  it("appends a profile and saves the config", async () => {
    const deps = makeFakeDeps()
    const result = await runCli(deps)([
      "add",
      "profile",
      "--id",
      "prof_fast",
      "--name",
      "Fast",
      "--harness",
      "claude",
      "--model",
      "fast",
      "--env",
      "ANTHROPIC_MODEL=sonnet,FOO=bar",
    ])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const added = loaded.value.profiles.find((p) => p.id === "prof_fast")
    expect(added?.name).toBe("Fast")
    expect(added?.harnessId).toBe("claude")
    expect(added?.alias).toBe("fast")
    expect(added?.env).toEqual({ ANTHROPIC_MODEL: "sonnet", FOO: "bar" })
  })

  it("creates a profile with an empty env map when no --env flag is given", async () => {
    const deps = makeFakeDeps()
    const result = await runCli(deps)([
      "add",
      "profile",
      "--id",
      "prof_x",
      "--name",
      "X",
      "--harness",
      "claude",
      "--model",
      "default",
    ])
    expect(result).toEqual({ ok: true, value: undefined })
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles[0]?.env).toEqual({})
  })

  it("returns a usage error when a required profile flag is missing", async () => {
    const result = await runCli(makeFakeDeps())([
      "add",
      "profile",
      "--id",
      "prof_x",
      "--name",
      "X",
      "--harness",
      "claude",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a failed error when the profile id already exists", async () => {
    const seeded = {
      ...defaultConfig(),
      profiles: [
        {
          id: "prof_fast" as never,
          name: "Fast" as const,
          harnessId: "claude" as never,
          alias: "fast" as never,
          env: {},
        },
      ],
    }
    const result = await runCli(makeFakeDeps({ initialConfig: seeded }))([
      "add",
      "profile",
      "--id",
      "prof_fast",
      "--name",
      "Dup",
      "--harness",
      "codex",
      "--model",
      "default",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/add-profile.test.ts`
  Expected failure: every case fails — `add profile …` hits the `default` branch of the `add` dispatcher and returns `{ ok: false, error: { kind: "usage", detail: "add <provider|alias> --…" } }`, so the success cases are not `{ ok: true, value: undefined }` and no profile is persisted.

- [ ] **Step 3: Implement** — in `packages/cli/src/mutate-command.ts`: import `Profile`/`ProfileSchema`, add `addProfile` mirroring `addProvider`, and wire `case "profile":`. Add the imports to the existing `@launchkit/types` import block:

```ts
import {
  type ModelAlias,
  ModelAliasSchema,
  type Profile,
  ProfileSchema,
  type Provider,
  ProviderSchema,
  SdkProviderSchema,
} from "@launchkit/types"
```

Add `addProfile` immediately after `addAlias` (after :117):

```ts
const addProfile = async (
  deps: CliDeps,
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const id = requireFlag(flags, "id")
  if (isErr(id)) return id
  const name = requireFlag(flags, "name")
  if (isErr(name)) return name
  const harness = requireFlag(flags, "harness")
  if (isErr(harness)) return harness
  const model = requireFlag(flags, "model")
  if (isErr(model)) return model

  if (config.profiles.some((p) => p.id === id.value)) {
    return err({
      kind: "failed",
      detail: `profile already exists: ${id.value}`,
    })
  }

  // Validate through ProfileSchema so the branded ids are constructed from one source
  // of truth and a bad shape is rejected before save. `--env K=V,…` parses via splitEnv.
  const candidate = ProfileSchema.safeParse({
    id: id.value,
    name: name.value,
    harnessId: harness.value,
    alias: model.value,
    env: splitEnv(flags),
  })
  if (!candidate.success) {
    return err({ kind: "usage", detail: candidate.error.message })
  }
  const profile: Profile = candidate.data

  return saveOrFail(deps, {
    ...config,
    profiles: [...config.profiles, profile],
  })
}
```

Add `case "profile":` to the `add` dispatcher's `switch` and update its `default` detail:

```ts
  const target = rest[0]
  switch (target) {
    case "provider":
      return addProvider(deps, loaded.value, flags)
    case "alias":
      return addAlias(deps, loaded.value, flags)
    case "profile":
      return addProfile(deps, loaded.value, flags)
    default:
      return err({ kind: "usage", detail: "add <provider|alias|profile> --…" })
  }
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/add-profile.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/mutate-command.ts packages/cli/src/add-profile.test.ts && git commit -m "feat(cli): add profile (C.3)"`

---

### Task C.4: `remove profile <id>` — immutable filter, not-found check, save

**Files:**
- Modify: `packages/cli/src/mutate-command.ts` (add `removeProfile` after `removeAlias` at :166; add `case "profile":` to the `remove` dispatcher's `switch` at :178, and update its `default` usage detail)
- Test: `packages/cli/src/remove-profile.test.ts` (NEW)

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/remove-profile.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const seededWithProfile = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "claude" as never,
      alias: "fast" as never,
      env: {},
    },
  ],
})

describe("remove profile", () => {
  it("removes the profile by id and saves the config", async () => {
    const deps = makeFakeDeps({ initialConfig: seededWithProfile() })
    const result = await runCli(deps)(["remove", "profile", "prof_fast"])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles).toEqual([])
  })

  it("returns a failed error when the profile id is not found", async () => {
    const deps = makeFakeDeps({ initialConfig: seededWithProfile() })
    const result = await runCli(deps)(["remove", "profile", "prof_ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")

    // The existing profile is untouched.
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.profiles).toHaveLength(1)
  })

  it("returns a usage error when no profile id is given", async () => {
    const result = await runCli(makeFakeDeps())(["remove", "profile"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/remove-profile.test.ts`
  Expected failure: every case fails — `remove profile …` hits the `default` branch of the `remove` dispatcher and returns `{ ok: false, error: { kind: "usage", detail: "remove <provider|alias> <id>" } }`, so the success case is not `{ ok: true, value: undefined }` and the not-found case reports `kind: "usage"` rather than `kind: "failed"`.

- [ ] **Step 3: Implement** — in `packages/cli/src/mutate-command.ts`, add `removeProfile` immediately after `removeAlias` (after :166):

```ts
const removeProfile = async (
  deps: CliDeps,
  config: Config,
  id: string | undefined,
): Promise<Result<void, CliError>> => {
  if (id === undefined)
    return err({ kind: "usage", detail: "remove profile <id>" })
  const next = config.profiles.filter((p) => p.id !== id)
  if (next.length === config.profiles.length) {
    return err({ kind: "failed", detail: `unknown profile: ${id}` })
  }
  return saveOrFail(deps, { ...config, profiles: next })
}
```

Add `case "profile":` to the `remove` dispatcher's `switch` and update its `default` detail:

```ts
  const target = rest[0]
  switch (target) {
    case "provider":
      return removeProvider(deps, loaded.value, rest[1])
    case "alias":
      return removeAlias(deps, loaded.value, rest[1])
    case "profile":
      return removeProfile(deps, loaded.value, rest[1])
    default:
      return err({
        kind: "usage",
        detail: "remove <provider|alias|profile> <id>",
      })
  }
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/remove-profile.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/mutate-command.ts packages/cli/src/remove-profile.test.ts && git commit -m "feat(cli): remove profile (C.4)"`

---

### Task C.5: `launch --profile <id>` — seed harness/alias/env from the profile; positional + `--model` override

**Files:**
- Modify: `packages/cli/src/launch-command.ts` (relax the `rest[0]` requirement and resolve harness id + alias + env from an optional profile; pass `env` to `deps.launch`)
- Test: `packages/cli/src/launch-profile.test.ts` (NEW)

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/launch-profile.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import type { LaunchParams } from "@launchkit/harnesses"
import {
  AliasNameSchema,
  type HarnessDefinition,
  HarnessIdSchema,
} from "@launchkit/types"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const harness = (id: string): HarnessDefinition => ({
  id: HarnessIdSchema.parse(id),
  name: id,
  command: id,
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
})

const claude = harness("claude")
const codex = harness("codex")

const seededWithProfile = () => ({
  ...defaultConfig(),
  profiles: [
    {
      id: "prof_fast" as never,
      name: "Fast" as const,
      harnessId: "claude" as never,
      alias: "fast" as never,
      env: { ANTHROPIC_MODEL: "sonnet" },
    },
  ],
})

describe("launch --profile", () => {
  it("seeds harness, alias and env from the profile", async () => {
    const calls: LaunchParams[] = []
    const deps = makeFakeDeps({
      harnesses: [claude, codex],
      initialConfig: seededWithProfile(),
      launchSpy: (p) => calls.push(p),
    })

    const result = await runCli(deps)(["launch", "--profile", "prof_fast"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(calls[0]?.harness.id).toBe("claude")
    expect(String(calls[0]?.model)).toBe("fast")
    expect(calls[0]?.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })

    // The recorded session uses the profile's harness + alias.
    const list = deps.sessions.query()
    expect(list.ok && list.value[0]?.harnessId).toBe("claude")
    expect(list.ok && String(list.value[0]?.alias)).toBe("fast")
  })

  it("lets a positional harnessId and --model override the profile", async () => {
    const calls: LaunchParams[] = []
    const deps = makeFakeDeps({
      harnesses: [claude, codex],
      initialConfig: seededWithProfile(),
      launchSpy: (p) => calls.push(p),
    })

    const result = await runCli(deps)([
      "launch",
      "codex",
      "--profile",
      "prof_fast",
      "--model",
      "slow",
    ])

    expect(result).toEqual({ ok: true, value: undefined })
    // positional harnessId beats the profile's harness ...
    expect(calls[0]?.harness.id).toBe("codex")
    // ... and --model beats the profile's alias ...
    expect(String(calls[0]?.model)).toBe("slow")
    // ... while the profile's env is still seeded.
    expect(calls[0]?.env).toEqual({ ANTHROPIC_MODEL: "sonnet" })
  })

  it("returns a usage error when --profile names an unknown profile", async () => {
    const deps = makeFakeDeps({
      harnesses: [claude],
      initialConfig: seededWithProfile(),
    })
    const result = await runCli(deps)(["launch", "--profile", "prof_ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("still requires a positional harnessId when no --profile is given", async () => {
    const result = await runCli(makeFakeDeps({ harnesses: [claude] }))([
      "launch",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/launch-profile.test.ts`
  Expected failure: the `"seeds harness, alias and env from the profile"` case fails — with no positional id, `launchCommand` returns the `{ kind: "usage", detail: "launch <harnessId> [--model <alias>]" }` error (the current code reads only `rest[0]` and ignores `--profile`), so `result` is not `{ ok: true, value: undefined }`.

- [ ] **Step 3: Implement** — rewrite `packages/cli/src/launch-command.ts` to resolve the harness id, alias, and env from an optional profile, with the positional id and `--model` overriding. The full file becomes:

```ts
import type { Config } from "@launchkit/config"
import type { RunningProxy } from "@launchkit/proxy"
import {
  type AliasName,
  AliasNameSchema,
  type HarnessDefinition,
  type Profile,
} from "@launchkit/types"
import { type Result, err, isErr, ok } from "@launchkit/utils"
import type { CliDeps } from "./deps"
import type { CliError } from "./errors"

/** Look up the `--profile <id>` profile in config, if the flag is present. */
const resolveProfile = (
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Result<Profile | undefined, CliError> => {
  const flag = flags.profile
  if (typeof flag !== "string") return ok(undefined)
  const found = config.profiles.find((p) => p.id === flag)
  return found === undefined
    ? err({ kind: "usage", detail: `unknown profile: ${flag}` })
    : ok(found)
}

/**
 * Resolve the harness id to launch: the positional `<harnessId>` wins; otherwise the
 * `--profile`'s harness. Errors only when neither is present.
 */
const resolveHarnessId = (
  positional: string | undefined,
  profile: Profile | undefined,
): Result<string, CliError> => {
  if (positional !== undefined) return ok(positional)
  if (profile !== undefined) return ok(String(profile.harnessId))
  return err({ kind: "usage", detail: "launch <harnessId> [--model <alias>]" })
}

/** Resolve the alias: `--model` wins, then the profile's alias, then the harness default. */
const resolveAlias = (
  harness: HarnessDefinition,
  profile: Profile | undefined,
  flags: Readonly<Record<string, string | boolean>>,
): AliasName => {
  const flag = flags.model
  if (typeof flag === "string") return AliasNameSchema.parse(flag)
  if (profile !== undefined) return profile.alias
  return harness.defaultAlias
}

/**
 * `launch [<harnessId>] [--profile <id>] [--model <alias>] [--name <name>] [--cwd <dir>]`.
 *
 * Loads config; if `--profile` is given, seeds the harness, alias, and env from it (a
 * positional `<harnessId>` and `--model` override the profile, and `--profile` makes the
 * positional id optional). Ensures a proxy is up (reusing a running one, else starting an
 * ephemeral one with a freshly generated per-run key), launches the harness with the
 * profile's env + `--cwd`, and records a session with `--name`/`--cwd`. SECURITY: the
 * generated proxy key flows only into `deps.launch(...)` — never to `deps.out.write`.
 */
export const launchCommand = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded))
    return err({ kind: "failed", detail: "could not load config" })
  const { settings } = loaded.value

  const profileResult = resolveProfile(loaded.value, flags)
  if (isErr(profileResult)) return profileResult
  const profile = profileResult.value

  const harnessIdResult = resolveHarnessId(rest[0], profile)
  if (isErr(harnessIdResult)) return harnessIdResult
  const harnessId = harnessIdResult.value

  const listed = await deps.registry.list()
  if (isErr(listed))
    return err({ kind: "failed", detail: "could not list harnesses" })

  const harness = listed.value.find((h) => h.id === harnessId)
  if (harness === undefined) {
    return err({ kind: "usage", detail: `unknown harness: ${harnessId}` })
  }

  const alias = resolveAlias(harness, profile, flags)
  const env = profile?.env ?? {}
  const cwd = typeof flags.cwd === "string" ? flags.cwd : undefined
  const name = typeof flags.name === "string" ? flags.name : undefined
  const proxyUrl = `http://${settings.proxyHost}:${settings.proxyPort}`

  // Ensure a proxy is up. Reuse a running one (reading its persisted per-run key so the
  // harness authenticates against it); otherwise start an ephemeral one and persist its key.
  const alreadyRunning = await deps.proxy.isRunning(proxyUrl)
  let proxyKey: string
  // The ephemeral proxy this run OWNS (started here) — null when reusing a running one. We keep
  // the handle so we can stop it after the harness exits (a reused proxy is never ours to stop).
  let owned: RunningProxy | null = null
  if (alreadyRunning) {
    // Reuse the running proxy's key so auth succeeds; fall back to a fresh one only if the
    // runtime file is missing (e.g. a proxy started outside this app).
    proxyKey = (await deps.runtime.readProxyKey()) ?? deps.genProxyKey()
  } else {
    proxyKey = deps.genProxyKey()
    owned = deps.proxy.start({
      host: settings.proxyHost,
      port: settings.proxyPort,
      proxyKey,
      config: loaded.value,
    })
    await deps.runtime.writeProxyKey(proxyKey)
  }

  const launched = deps.launch({
    harness,
    proxyUrl,
    proxyKey,
    model: alias,
    ...(cwd !== undefined ? { cwd } : {}),
    env,
  })
  if (isErr(launched)) {
    // Spawning failed: tear down the proxy we just started so we don't leak it.
    owned?.stop()
    return err({ kind: "failed", detail: "failed to launch harness" })
  }

  const session = deps.sessions.create({
    harnessId: harness.id,
    alias,
    ...(name !== undefined ? { name } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
  })
  if (isErr(session)) {
    owned?.stop()
    return err({ kind: "failed", detail: "failed to record session" })
  }

  deps.out.write(
    `launched ${harness.id} (pid ${launched.value.pid}, session ${session.value.id})`,
  )

  // Run the harness in the FOREGROUND: keep this process (and any ephemeral proxy we started)
  // alive until the harness exits, so an interactive TUI owns the terminal and can talk to the
  // proxy. Then stop the proxy we OWN (never a reused, externally-running one).
  await launched.value.exited
  owned?.stop()
  return ok(undefined)
}
```

> The existing `launch-command.test.ts` suite still passes unchanged: those tests always pass a positional `claude`, never `--profile`, so `resolveProfile` returns `ok(undefined)`, `resolveHarnessId` returns the positional id, and `resolveAlias` falls through to `--model` / `defaultAlias` exactly as before. `env` defaults to `{}` (a harmless extra `LaunchParams` field the launch spy ignores).

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/launch-profile.test.ts && bun test packages/cli/src/launch-command.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/launch-command.ts packages/cli/src/launch-profile.test.ts && git commit -m "feat(cli): launch --profile seeds harness/alias/env (C.5)"`

---

### Task C.6: `launch --name` / `--cwd` reach `deps.sessions.create` and `deps.launch`

**Files:**
- Modify: none — the behavior ships in C.5 (`name`/`cwd` are read off `flags` and threaded into `deps.launch` + `deps.sessions.create`). This task LOCKS that contract with a dedicated test.
- Test: `packages/cli/src/launch-name-cwd.test.ts` (NEW)

> If C.5's implementation already satisfies this test, the RED step still matters: write the test FIRST and confirm it is RED against a *hypothetical* regression — i.e. if C.5 had not threaded `name`/`cwd`, these assertions would fail. In practice, run it after C.5 and confirm GREEN; keep it as a regression guard. (If you implement C.5 and C.6 together, write BOTH test files first, observe both RED, then implement once.)

- [ ] **Step 1: Write the failing test** — create `packages/cli/src/launch-name-cwd.test.ts`. It wraps the fake `sessions` store with a thin spy (no `makeFakeDeps` change) to capture the exact `SessionInput`, and reads `--cwd` off the launch spy's `LaunchParams`:

```ts
import { describe, expect, it } from "bun:test"
import type { LaunchParams } from "@launchkit/harnesses"
import type { SessionInput } from "@launchkit/sessions"
import {
  AliasNameSchema,
  type HarnessDefinition,
  HarnessIdSchema,
} from "@launchkit/types"
import type { CliDeps } from "./deps"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const claude: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
}

describe("launch --name / --cwd", () => {
  it("threads --name and --cwd into deps.sessions.create and --cwd into deps.launch", async () => {
    const launchCalls: LaunchParams[] = []
    const createInputs: SessionInput[] = []
    const base = makeFakeDeps({
      harnesses: [claude],
      launchSpy: (p) => launchCalls.push(p),
    })
    // Wrap the real in-memory session store so we can assert the exact create() input.
    const deps: CliDeps = {
      ...base,
      sessions: {
        ...base.sessions,
        create: (input: SessionInput) => {
          createInputs.push(input)
          return base.sessions.create(input)
        },
      },
    }

    const result = await runCli(deps)([
      "launch",
      "claude",
      "--name",
      "My run",
      "--cwd",
      "/Users/fred/projects/app",
    ])

    expect(result).toEqual({ ok: true, value: undefined })

    // --cwd reaches the launcher (which sets the child process cwd).
    expect(launchCalls[0]?.cwd).toBe("/Users/fred/projects/app")

    // --name and --cwd reach the session record.
    expect(createInputs[0]?.name).toBe("My run")
    expect(createInputs[0]?.cwd).toBe("/Users/fred/projects/app")
  })

  it("omits name/cwd from the session input when the flags are absent", async () => {
    const createInputs: SessionInput[] = []
    const base = makeFakeDeps({ harnesses: [claude] })
    const deps: CliDeps = {
      ...base,
      sessions: {
        ...base.sessions,
        create: (input: SessionInput) => {
          createInputs.push(input)
          return base.sessions.create(input)
        },
      },
    }

    const result = await runCli(deps)(["launch", "claude"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(createInputs[0]?.name).toBeUndefined()
    expect(createInputs[0]?.cwd).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/cli/src/launch-name-cwd.test.ts`
  Expected (if authored BEFORE C.5, or against a regression that drops the threading): the first case fails — `launchCalls[0]?.cwd` is `undefined` and `createInputs[0]?.name`/`.cwd` are `undefined` because the pre-C.5 `launchCommand` never read `--name`/`--cwd`. (If C.5 already shipped, this test is GREEN immediately and stands as the regression guard — note this in the commit.)

- [ ] **Step 3: Implement** — no code change beyond C.5. If you skipped the threading in C.5, add it now: read `name`/`cwd` off `flags` (`typeof flags.cwd === "string" ? flags.cwd : undefined`, likewise `name`), spread `cwd` into the `deps.launch({...})` call, and spread `name`/`cwd` into `deps.sessions.create({...})` (see the C.5 implementation block).

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/cli/src/launch-name-cwd.test.ts`

- [ ] **Step 5: Commit** — `git add packages/cli/src/launch-name-cwd.test.ts && git commit -m "test(cli): lock launch --name/--cwd threading (C.6)"`

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green.
## Phase 6 — `@launchkit/ui`: master/detail redesign components (atoms → templates)

**Scope:** `packages/ui/src` only — **pure presentational** atoms, molecules, organisms, and the reworked `AppShell` template for the master/detail redesign. Dumb components never fetch and never call IPC: data enters via props, user actions surface via callbacks. TypeScript strict, **no `any`**, every prop `readonly` with an explicit `Props` type. One component per file with a co-located `*.test.tsx`. TDD (RED → GREEN → REFACTOR) with `bun test` (Jest API via `bun:test`).

> **NOT in this phase:** the embedded `TerminalPane`, `app.tsx`, React hooks, and IPC handlers — those live in `apps/desktop` and are a later phase. This phase only builds the dumb building blocks the desktop pages will compose.

**Upstream contract this phase consumes (frozen by Phase 1 — `1-types.md`):**
- `Session` now has optional `name?: string` and `cwd?: string`.
- `Profile = { id: ProfileId; name: string; harnessId: HarnessId; alias: AliasName; env: Record<string, string> }`.
- Branded ids `SessionId`, `ProfileId`, `HarnessId`, `AliasName` are `z.infer` of branded strings, plus `HarnessDefinition`, `ModelAlias`.
- All exported from `@launchkit/types`.

**Conventions locked from existing `packages/ui/src` code (mirror exactly):**
- **Test imports:** `import { describe, expect, it, mock } from "bun:test"` and `import { fireEvent, render, screen } from "@testing-library/react"`. Mocks are `mock((_arg: T) => {})`. (See `Button.test.tsx`, `HarnessForm.test.tsx`.)
- **Test setup is global** via the root `test/setup.ts` preload (registers happy-dom, extends jest-dom matchers, `afterEach(cleanup)`). **No per-file setup** — never register happy-dom or call `cleanup` inside a `*.test.tsx`.
- **Query style:** `screen.getByRole(...)` / `getByLabelText(...)` / `getByText(...)`; `queryBy*` + `toBeNull()` for absence; `getAllByRole("row")` for counts. Events via `fireEvent.click` / `fireEvent.change(el, { target: { value } })`.
- **Component shape:** `import type { ReactElement, ReactNode } from "react"`; `export type XProps = { readonly ... }`; arrow component returning JSX typed `: ReactElement`. Callbacks invoked as `() => onClick()`. (See `Button.tsx`, `AliasRow.tsx`.)
- **Forms** mirror `HarnessForm.tsx`: local `useState<Values>(initialValues)`, a generic `update<K extends keyof Values>(key, value)` helper, `<form onSubmit>` calling `e.preventDefault()` then a guarded `submit()`, `<Button>Save</Button>` + secondary `Cancel`.
- **Branded-id fixtures:** tests cast plain objects, e.g. `as unknown as readonly Session[]` (see `SessionTable.test.tsx`) or `as ProfileId` for a single id, because branded types reject raw `string` literals.
- **Lint (biome):** imports auto-organized (alphabetical), type-only imports use `import type`, no unused imports, no semicolons, double quotes, trailing commas everywhere, 2-space indent. Write samples accordingly.
- **Barrels:** add each new component to its level `index.ts` (`atoms/`, `molecules/`, `organisms/`, `templates/`) — the package barrel `src/index.ts` re-exports each level, so no edit there. Extend `src/index.test.ts` to assert the new names are exported (Task U.12).

**Reused existing exports:** `Button`, `TextInput`, `Select`, `Badge`, `StatusDot`, `Label`, `Spinner`, `FormField`, `EmptyState`.

---

### Task U.1: `Modal` atom — overlay + focus trap + Esc/backdrop close

**Files:**
- Create: `packages/ui/src/atoms/Modal.tsx`
- Modify: `packages/ui/src/atoms/index.ts`
- Test: `packages/ui/src/atoms/Modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    render(
      <Modal title="New session" open={false} onClose={() => {}}>
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("renders a labelled dialog with its title and children when open", () => {
    render(
      <Modal title="New session" open onClose={() => {}}>
        <p>body content</p>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog", { name: "New session" })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("body content")).toBeInTheDocument()
  })
  it("calls onClose when the close button is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("calls onClose when the Escape key is pressed", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("calls onClose when the backdrop is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByTestId("modal-backdrop"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("does not call onClose when the dialog body is clicked", () => {
    const onClose = mock(() => {})
    render(
      <Modal title="New session" open onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText("body"))
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/atoms/Modal.test.tsx`
  Expected failure: `error: Cannot find module './Modal'` (the component file does not exist yet).

- [ ] **Step 3: Implement** — `packages/ui/src/atoms/Modal.tsx`. The backdrop owns the click-to-close; the inner dialog stops propagation so body clicks do not bubble to the backdrop. Esc is handled with `onKeyDown` on the dialog (focused on mount). A "focus trap" here = the dialog is focusable (`tabIndex={-1}`) and auto-focused; full tab-cycling is out of scope for the dumb atom.

```tsx
import { useEffect, useRef } from "react"
import type { ReactElement, ReactNode } from "react"

export type ModalProps = {
  readonly title: string
  readonly open: boolean
  readonly onClose: () => void
  readonly children: ReactNode
}

export const Modal = ({
  title,
  open,
  onClose,
  children,
}: ModalProps): ReactElement | null => {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop close mirrors the dialog Esc handler
    <div
      data-testid="modal-backdrop"
      onClick={() => onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={() => onClose()}>
            ×
          </button>
        </header>
        <div>{children}</div>
      </div>
    </div>
  )
}
```

Then add to `packages/ui/src/atoms/index.ts`: `export * from "./Modal"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/atoms/Modal.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/atoms/Modal.tsx packages/ui/src/atoms/Modal.test.tsx packages/ui/src/atoms/index.ts && git commit -m "feat(ui): add Modal atom (U.1)"`

---

### Task U.2: `IconButton` atom — rail icon button

**Files:**
- Create: `packages/ui/src/atoms/IconButton.tsx`
- Modify: `packages/ui/src/atoms/index.ts`
- Test: `packages/ui/src/atoms/IconButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { IconButton } from "./IconButton"

describe("IconButton", () => {
  it("exposes the label as its accessible name", () => {
    render(
      <IconButton label="Sessions" onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument()
  })
  it("calls onClick when clicked", () => {
    const onClick = mock(() => {})
    render(
      <IconButton label="Settings" onClick={onClick}>
        <svg />
      </IconButton>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it("marks itself current when active is true", () => {
    render(
      <IconButton label="Sessions" active onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("is not current when active is omitted", () => {
    render(
      <IconButton label="Sessions" onClick={() => {}}>
        <svg />
      </IconButton>,
    )
    expect(
      screen.getByRole("button", { name: "Sessions" }),
    ).not.toHaveAttribute("aria-current")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/atoms/IconButton.test.tsx`
  Expected failure: `error: Cannot find module './IconButton'`.

- [ ] **Step 3: Implement** — `packages/ui/src/atoms/IconButton.tsx`

```tsx
import type { ReactElement, ReactNode } from "react"

export type IconButtonProps = {
  readonly label: string
  readonly active?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

export const IconButton = ({
  label,
  active = false,
  onClick,
  children,
}: IconButtonProps): ReactElement => (
  <button
    type="button"
    aria-label={label}
    aria-current={active ? "page" : undefined}
    data-active={active}
    onClick={() => onClick()}
  >
    {children}
  </button>
)
```

Then add to `packages/ui/src/atoms/index.ts`: `export * from "./IconButton"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/atoms/IconButton.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/atoms/IconButton.tsx packages/ui/src/atoms/IconButton.test.tsx packages/ui/src/atoms/index.ts && git commit -m "feat(ui): add IconButton atom (U.2)"`

---

### Task U.3: `RailItem` molecule — wraps `IconButton` for a rail entry

**Files:**
- Create: `packages/ui/src/molecules/RailItem.tsx`
- Modify: `packages/ui/src/molecules/index.ts`
- Test: `packages/ui/src/molecules/RailItem.test.tsx`

> `RailItem` is the thin molecule the `AppShell` rail composes (Task U.11). It forwards `label`/`active`/`onClick`/`children` straight to `IconButton`; keeping it a named molecule lets the rail read declaratively and lets the desktop layer swap rail styling without touching the template.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { RailItem } from "./RailItem"

describe("RailItem", () => {
  it("renders an icon button exposing the label", () => {
    render(
      <RailItem label="Sessions" onClick={() => {}}>
        <svg />
      </RailItem>,
    )
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument()
  })
  it("forwards the active state to aria-current", () => {
    render(
      <RailItem label="Settings" active onClick={() => {}}>
        <svg />
      </RailItem>,
    )
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("calls onClick when activated", () => {
    const onClick = mock(() => {})
    render(
      <RailItem label="Sessions" onClick={onClick}>
        <svg />
      </RailItem>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/molecules/RailItem.test.tsx`
  Expected failure: `error: Cannot find module './RailItem'`.

- [ ] **Step 3: Implement** — `packages/ui/src/molecules/RailItem.tsx`

```tsx
import type { ReactElement, ReactNode } from "react"
import { IconButton } from "../atoms/IconButton"

export type RailItemProps = {
  readonly label: string
  readonly active?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

export const RailItem = ({
  label,
  active = false,
  onClick,
  children,
}: RailItemProps): ReactElement => (
  <li>
    <IconButton label={label} active={active} onClick={onClick}>
      {children}
    </IconButton>
  </li>
)
```

Then add to `packages/ui/src/molecules/index.ts`: `export * from "./RailItem"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/molecules/RailItem.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/molecules/RailItem.tsx packages/ui/src/molecules/RailItem.test.tsx packages/ui/src/molecules/index.ts && git commit -m "feat(ui): add RailItem molecule (U.3)"`

---

### Task U.4: `FolderField` molecule — text input + Browse button

**Files:**
- Create: `packages/ui/src/molecules/FolderField.tsx`
- Modify: `packages/ui/src/molecules/index.ts`
- Test: `packages/ui/src/molecules/FolderField.test.tsx`

> `FolderField` is purely presentational: it renders a `TextInput` + a "Browse…" `Button` and surfaces both `onChange` (typed path edits) and `onBrowse` (the desktop layer opens the native dialog via IPC). It NEVER calls IPC itself.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { FolderField } from "./FolderField"

describe("FolderField", () => {
  it("shows the current folder value in the input", () => {
    render(
      <FolderField
        id="cwd"
        value="/Users/fred/app"
        onChange={() => {}}
        onBrowse={() => {}}
      />,
    )
    expect(screen.getByDisplayValue("/Users/fred/app")).toBeInTheDocument()
  })
  it("calls onChange with the typed path when the input changes", () => {
    const onChange = mock((_v: string) => {})
    render(
      <FolderField id="cwd" value="" onChange={onChange} onBrowse={() => {}} />,
    )
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "/tmp/x" },
    })
    expect(onChange).toHaveBeenCalledWith("/tmp/x")
  })
  it("calls onBrowse when the Browse button is clicked", () => {
    const onBrowse = mock(() => {})
    render(
      <FolderField id="cwd" value="" onChange={() => {}} onBrowse={onBrowse} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/molecules/FolderField.test.tsx`
  Expected failure: `error: Cannot find module './FolderField'`.

- [ ] **Step 3: Implement** — `packages/ui/src/molecules/FolderField.tsx`

```tsx
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { TextInput } from "../atoms/TextInput"

export type FolderFieldProps = {
  readonly id: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBrowse: () => void
}

export const FolderField = ({
  id,
  value,
  onChange,
  onBrowse,
}: FolderFieldProps): ReactElement => (
  <div>
    <TextInput id={id} value={value} onChange={onChange} />
    <Button variant="secondary" onClick={() => onBrowse()}>
      Browse…
    </Button>
  </div>
)
```

Then add to `packages/ui/src/molecules/index.ts`: `export * from "./FolderField"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/molecules/FolderField.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/molecules/FolderField.tsx packages/ui/src/molecules/FolderField.test.tsx packages/ui/src/molecules/index.ts && git commit -m "feat(ui): add FolderField molecule (U.4)"`

---

### Task U.5: `relativeTime` pure helper for `SessionRow`

**Files:**
- Create: `packages/ui/src/molecules/relativeTime.ts`
- Test: `packages/ui/src/molecules/relativeTime.test.ts`

> `SessionRow`'s frozen prop list does NOT include a clock, and `@launchkit/utils` has no relative-time formatter. To keep `SessionRow` deterministic and testable, extract a **pure** `relativeTime(iso, now)` helper here (explicit `now` arg → no hidden clock). `SessionRow` (Task U.6) calls it with `Date.now()` as the only minor read of wall-clock — kept out of the component's tested surface, and unit-tested here in isolation.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test"
import { relativeTime } from "./relativeTime"

const base = Date.parse("2026-06-04T12:00:00.000Z")

describe("relativeTime", () => {
  it("returns 'just now' for timestamps under a minute old", () => {
    expect(relativeTime("2026-06-04T11:59:30.000Z", base)).toBe("just now")
  })
  it("returns whole minutes for sub-hour ages", () => {
    expect(relativeTime("2026-06-04T11:45:00.000Z", base)).toBe("15m ago")
  })
  it("returns whole hours for sub-day ages", () => {
    expect(relativeTime("2026-06-04T09:00:00.000Z", base)).toBe("3h ago")
  })
  it("returns whole days for older timestamps", () => {
    expect(relativeTime("2026-06-02T12:00:00.000Z", base)).toBe("2d ago")
  })
  it("treats future timestamps as 'just now'", () => {
    expect(relativeTime("2026-06-04T12:05:00.000Z", base)).toBe("just now")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/molecules/relativeTime.test.ts`
  Expected failure: `error: Cannot find module './relativeTime'`.

- [ ] **Step 3: Implement** — `packages/ui/src/molecules/relativeTime.ts`

```ts
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const relativeTime = (iso: string, now: number): string => {
  const elapsed = now - Date.parse(iso)
  if (elapsed < MINUTE) return "just now"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  return `${Math.floor(elapsed / DAY)}d ago`
}
```

> Not added to a barrel — internal helper for `SessionRow` only (no deep-import concern; same package).

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/molecules/relativeTime.test.ts`

- [ ] **Step 5: Commit** — `git add packages/ui/src/molecules/relativeTime.ts packages/ui/src/molecules/relativeTime.test.ts && git commit -m "feat(ui): add relativeTime helper (U.5)"`

---

### Task U.6: `SessionRow` molecule — three-line session row

**Files:**
- Create: `packages/ui/src/molecules/SessionRow.tsx`
- Modify: `packages/ui/src/molecules/index.ts`
- Test: `packages/ui/src/molecules/SessionRow.test.tsx`

> **Layout (frozen):** Line 1 = `StatusDot` + (`session.name ?? session.id`) + a status `Badge` (`running` when `endedAt` is undefined; else `exit {exitCode}`, `success` tone when `exitCode === 0`, else `danger`). Line 2 = `harnessName · model`. Line 3 = `session.cwd · <relativeTime(startedAt)>`. Whole row is a button surfacing `onSelect`; `selected` toggles `aria-pressed`.

- [ ] **Step 1: Write the failing test** — branded `Session` fixtures are cast `as unknown as Session` (mirrors `SessionTable.test.tsx`). Relative time is asserted by stable substring (the row composes `relativeTime`, unit-tested in U.5) so the test stays clock-independent.

```tsx
import { describe, expect, it, mock } from "bun:test"
import type { Session } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionRow } from "./SessionRow"

const running = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-06-04T11:59:30.000Z",
  name: "Refactor auth",
  cwd: "/Users/fred/app",
} as unknown as Session

const exited = {
  id: "s_2",
  harnessId: "codex",
  alias: "fast",
  startedAt: "2026-06-03T10:00:00.000Z",
  endedAt: "2026-06-03T10:05:00.000Z",
  exitCode: 1,
  cwd: "/Users/fred/other",
} as unknown as Session

describe("SessionRow", () => {
  it("shows the session name when present", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("Refactor auth")).toBeInTheDocument()
  })
  it("falls back to the session id when there is no name", () => {
    render(
      <SessionRow
        session={exited}
        harnessName="Codex"
        model="gpt"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("s_2")).toBeInTheDocument()
  })
  it("shows a running badge when the session has not ended", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("running")).toBeInTheDocument()
  })
  it("shows the exit code with a danger tone for a non-zero exit", () => {
    render(
      <SessionRow
        session={exited}
        harnessName="Codex"
        model="gpt"
        selected={false}
        onSelect={() => {}}
      />,
    )
    const badge = screen.getByText("exit 1")
    expect(badge).toHaveAttribute("data-tone", "danger")
  })
  it("renders harness name and model on the second line", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("Claude Code · sonnet")).toBeInTheDocument()
  })
  it("renders the cwd and a relative start time on the third line", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("session-row-meta").textContent).toContain(
      "/Users/fred/app",
    )
    expect(screen.getByTestId("session-row-meta").textContent).toMatch(
      /just now|ago/,
    )
  })
  it("marks itself pressed when selected", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true")
  })
  it("calls onSelect when the row is clicked", () => {
    const onSelect = mock(() => {})
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/molecules/SessionRow.test.tsx`
  Expected failure: `error: Cannot find module './SessionRow'`.

- [ ] **Step 3: Implement** — `packages/ui/src/molecules/SessionRow.tsx`

```tsx
import type { Session } from "@launchkit/types"
import type { ReactElement } from "react"
import { Badge } from "../atoms/Badge"
import { StatusDot } from "../atoms/StatusDot"
import { relativeTime } from "./relativeTime"

export type SessionRowProps = {
  readonly session: Session
  readonly harnessName: string
  readonly model: string
  readonly selected: boolean
  readonly onSelect: () => void
}

export const SessionRow = ({
  session,
  harnessName,
  model,
  selected,
  onSelect,
}: SessionRowProps): ReactElement => {
  const running = session.endedAt === undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      onClick={() => onSelect()}
    >
      <span>
        <StatusDot status={running ? "on" : "off"} label="session status" />
        <span>{session.name ?? session.id}</span>
        {running ? (
          <Badge tone="info">running</Badge>
        ) : (
          <Badge tone={session.exitCode === 0 ? "success" : "danger"}>
            {`exit ${session.exitCode ?? "?"}`}
          </Badge>
        )}
      </span>
      <span>{`${harnessName} · ${model}`}</span>
      <span data-testid="session-row-meta">
        {`${session.cwd ?? ""} · ${relativeTime(session.startedAt, Date.now())}`}
      </span>
    </button>
  )
}
```

Then add to `packages/ui/src/molecules/index.ts`: `export * from "./SessionRow"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/molecules/SessionRow.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/molecules/SessionRow.tsx packages/ui/src/molecules/SessionRow.test.tsx packages/ui/src/molecules/index.ts && git commit -m "feat(ui): add SessionRow molecule (U.6)"`

---

### Task U.7: `SessionList` organism — New + Running/Recent groups + View more

**Files:**
- Create: `packages/ui/src/organisms/SessionList.tsx`
- Modify: `packages/ui/src/organisms/index.ts`
- Test: `packages/ui/src/organisms/SessionList.test.tsx`

> Renders a "+ New session" `Button`, a "Running" group then a "Recent" group of `SessionRow`s, and a "View more" `Button` only when `hasMore`. `labelFor(session)` returns `{ harnessName, model }` for each row (the page resolves harness/alias display names — the organism stays dumb). `selectedId` highlights the matching row; `onSelect(id)` / `onMore()` / `onNew()` surface intent.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import type { Session, SessionId } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionList } from "./SessionList"

const running = [
  {
    id: "s_run",
    harnessId: "claude",
    alias: "default",
    startedAt: "2026-06-04T11:59:30.000Z",
    name: "Live run",
    cwd: "/Users/fred/app",
  },
] as unknown as readonly Session[]

const recent = [
  {
    id: "s_old",
    harnessId: "codex",
    alias: "fast",
    startedAt: "2026-06-03T10:00:00.000Z",
    endedAt: "2026-06-03T10:05:00.000Z",
    exitCode: 0,
    name: "Past run",
    cwd: "/Users/fred/other",
  },
] as unknown as readonly Session[]

const labelFor = (): { harnessName: string; model: string } => ({
  harnessName: "Harness",
  model: "model",
})

describe("SessionList", () => {
  it("renders a New session button that calls onNew when clicked", () => {
    const onNew = mock(() => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={onNew}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /new session/i }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
  it("renders Running and Recent group headings", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(screen.getByRole("heading", { name: /running/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /recent/i })).toBeInTheDocument()
  })
  it("renders a row for each running and recent session", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(screen.getByText("Live run")).toBeInTheDocument()
    expect(screen.getByText("Past run")).toBeInTheDocument()
  })
  it("calls onSelect with the session id when a row is clicked", () => {
    const onSelect = mock((_id: SessionId) => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={onSelect}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    fireEvent.click(screen.getByText("Live run"))
    expect(onSelect).toHaveBeenCalledWith("s_run")
  })
  it("does not render a View more button when hasMore is false", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: /view more/i })).toBeNull()
  })
  it("renders a View more button that calls onMore when hasMore is true", () => {
    const onMore = mock(() => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore
        onSelect={() => {}}
        onMore={onMore}
        onNew={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /view more/i }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/organisms/SessionList.test.tsx`
  Expected failure: `error: Cannot find module './SessionList'`.

- [ ] **Step 3: Implement** — `packages/ui/src/organisms/SessionList.tsx`. `SessionRow` calls `onSelect()` (no args), so the list closes over each id: `onSelect={() => onSelect(s.id)}`.

```tsx
import type { Session, SessionId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { SessionRow } from "../molecules/SessionRow"

export type SessionLabel = {
  readonly harnessName: string
  readonly model: string
}

export type SessionListProps = {
  readonly running: readonly Session[]
  readonly recent: readonly Session[]
  readonly labelFor: (session: Session) => SessionLabel
  readonly selectedId?: SessionId
  readonly hasMore: boolean
  readonly onSelect: (id: SessionId) => void
  readonly onMore: () => void
  readonly onNew: () => void
}

export const SessionList = ({
  running,
  recent,
  labelFor,
  selectedId,
  hasMore,
  onSelect,
  onMore,
  onNew,
}: SessionListProps): ReactElement => {
  const renderRow = (session: Session): ReactElement => {
    const label = labelFor(session)
    return (
      <SessionRow
        key={session.id}
        session={session}
        harnessName={label.harnessName}
        model={label.model}
        selected={session.id === selectedId}
        onSelect={() => onSelect(session.id)}
      />
    )
  }

  return (
    <div>
      <Button onClick={() => onNew()}>+ New session</Button>
      <section>
        <h3>Running</h3>
        {running.map(renderRow)}
      </section>
      <section>
        <h3>Recent</h3>
        {recent.map(renderRow)}
      </section>
      {hasMore ? (
        <Button variant="secondary" onClick={() => onMore()}>
          View more
        </Button>
      ) : null}
    </div>
  )
}
```

Then add to `packages/ui/src/organisms/index.ts`: `export * from "./SessionList"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/organisms/SessionList.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/organisms/SessionList.tsx packages/ui/src/organisms/SessionList.test.tsx packages/ui/src/organisms/index.ts && git commit -m "feat(ui): add SessionList organism (U.7)"`

---

### Task U.8: `SettingsNav` organism — settings section nav

**Files:**
- Create: `packages/ui/src/organisms/SettingsNav.tsx`
- Modify: `packages/ui/src/organisms/index.ts`
- Test: `packages/ui/src/organisms/SettingsNav.test.tsx`

> The master pane when `AppShell.mode === "settings"`. Renders one nav link per `{ key, label }`; the link matching `active` gets `aria-current="page"`; clicking surfaces `onSelect(key)`. Mirrors the existing nav idiom in `AppShell.test.tsx` (links + `aria-current`).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { SettingsNav } from "./SettingsNav"

const sections = [
  { key: "providers", label: "Providers" },
  { key: "harnesses", label: "Harnesses" },
  { key: "aliases", label: "Aliases" },
]

describe("SettingsNav", () => {
  it("renders a link per section", () => {
    render(
      <SettingsNav sections={sections} active="providers" onSelect={() => {}} />,
    )
    expect(screen.getByRole("link", { name: "Providers" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Harnesses" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Aliases" })).toBeInTheDocument()
  })
  it("marks the active section as current", () => {
    render(
      <SettingsNav sections={sections} active="harnesses" onSelect={() => {}} />,
    )
    expect(screen.getByRole("link", { name: "Harnesses" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })
  it("calls onSelect with the section key when a link is clicked", () => {
    const onSelect = mock((_k: string) => {})
    render(
      <SettingsNav
        sections={sections}
        active="providers"
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole("link", { name: "Aliases" }))
    expect(onSelect).toHaveBeenCalledWith("aliases")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/organisms/SettingsNav.test.tsx`
  Expected failure: `error: Cannot find module './SettingsNav'`.

- [ ] **Step 3: Implement** — `packages/ui/src/organisms/SettingsNav.tsx`

```tsx
import type { ReactElement } from "react"

export type SettingsSection = {
  readonly key: string
  readonly label: string
}

export type SettingsNavProps = {
  readonly sections: readonly SettingsSection[]
  readonly active: string
  readonly onSelect: (key: string) => void
}

export const SettingsNav = ({
  sections,
  active,
  onSelect,
}: SettingsNavProps): ReactElement => (
  <nav aria-label="Settings">
    <ul>
      {sections.map((section) => (
        <li key={section.key}>
          <a
            href={`#${section.key}`}
            aria-current={section.key === active ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault()
              onSelect(section.key)
            }}
          >
            {section.label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
)
```

Then add to `packages/ui/src/organisms/index.ts`: `export * from "./SettingsNav"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/organisms/SettingsNav.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/organisms/SettingsNav.tsx packages/ui/src/organisms/SettingsNav.test.tsx packages/ui/src/organisms/index.ts && git commit -m "feat(ui): add SettingsNav organism (U.8)"`

---

### Task U.9: `ProfileList` organism — list profiles with add/edit/delete

**Files:**
- Create: `packages/ui/src/organisms/ProfileList.tsx`
- Modify: `packages/ui/src/organisms/index.ts`
- Test: `packages/ui/src/organisms/ProfileList.test.tsx`

> Mirrors `AliasTable` (table + `EmptyState` when empty). Each row shows the profile name and its harness/alias, with Edit (→ `onEdit(profile)`) and Delete (→ `onDelete(profile.id)`) buttons, plus a top-level "Add profile" button (→ `onAdd()`). `ProfileId` fixtures are cast.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import type { Profile, ProfileId } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileList } from "./ProfileList"

const profiles = [
  {
    id: "prof_a",
    name: "Sonnet default",
    harnessId: "claude",
    alias: "default",
    env: {},
  },
  {
    id: "prof_b",
    name: "Fast codex",
    harnessId: "codex",
    alias: "fast",
    env: {},
  },
] as unknown as readonly Profile[]

describe("ProfileList", () => {
  it("shows an empty state when there are no profiles", () => {
    render(
      <ProfileList
        profiles={[]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(
      screen.getByRole("heading", { name: /no profiles/i }),
    ).toBeInTheDocument()
  })
  it("renders a row per profile showing its name", () => {
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByText("Sonnet default")).toBeInTheDocument()
    expect(screen.getByText("Fast codex")).toBeInTheDocument()
  })
  it("calls onAdd when the add button is clicked", () => {
    const onAdd = mock(() => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={onAdd}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
  it("calls onEdit with the profile when its edit button is clicked", () => {
    const onEdit = mock((_p: Profile) => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={onEdit}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0])
    expect(onEdit).toHaveBeenCalledWith(profiles[0])
  })
  it("calls onDelete with the profile id when its delete button is clicked", () => {
    const onDelete = mock((_id: ProfileId) => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[1])
    expect(onDelete).toHaveBeenCalledWith("prof_b")
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/organisms/ProfileList.test.tsx`
  Expected failure: `error: Cannot find module './ProfileList'`.

- [ ] **Step 3: Implement** — `packages/ui/src/organisms/ProfileList.tsx`

```tsx
import type { Profile, ProfileId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { EmptyState } from "../molecules/EmptyState"

export type ProfileListProps = {
  readonly profiles: readonly Profile[]
  readonly onAdd: () => void
  readonly onEdit: (profile: Profile) => void
  readonly onDelete: (id: ProfileId) => void
}

export const ProfileList = ({
  profiles,
  onAdd,
  onEdit,
  onDelete,
}: ProfileListProps): ReactElement => {
  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No profiles yet"
        hint="Save a launch configuration as a profile to reuse it."
      />
    )
  }
  return (
    <div>
      <Button onClick={() => onAdd()}>Add profile</Button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Harness</th>
            <th>Alias</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id}>
              <td>{profile.name}</td>
              <td>{profile.harnessId}</td>
              <td>{profile.alias}</td>
              <td>
                <Button variant="secondary" onClick={() => onEdit(profile)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => onDelete(profile.id)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

Then add to `packages/ui/src/organisms/index.ts`: `export * from "./ProfileList"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/organisms/ProfileList.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/organisms/ProfileList.tsx packages/ui/src/organisms/ProfileList.test.tsx packages/ui/src/organisms/index.ts && git commit -m "feat(ui): add ProfileList organism (U.9)"`

---

### Task U.10: `ProfileForm` organism — controlled profile form (mirrors `HarnessForm`)

**Files:**
- Create: `packages/ui/src/organisms/ProfileForm.tsx`
- Modify: `packages/ui/src/organisms/index.ts`
- Test: `packages/ui/src/organisms/ProfileForm.test.tsx`

> Controlled form mirroring `HarnessForm`'s idiom (local `useState`, generic `update`, guarded `submit`). Fields: **name** (`TextInput`), **harness** (`Select` of `harnesses`), **alias** (`Select` of `aliases`). `env` flows through unchanged from `initialValues` (a structured env editor is a later enhancement — the form preserves it so round-trips are lossless). `ProfileFormValues` carries branded `harnessId`/`alias`; the `Select` `onChange` gives a `string` cast to the branded type, mirroring `HarnessForm`'s `v as ApiFormat`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import type {
  HarnessDefinition,
  ModelAlias,
} from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileForm } from "./ProfileForm"
import type { ProfileFormValues } from "./ProfileForm"

const harnesses = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as unknown as readonly HarnessDefinition[]

const aliases = [
  { alias: "default", providerId: "p1", providerModel: "sonnet" },
  { alias: "fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelAlias[]

const initial = {
  name: "Sonnet default",
  harnessId: "claude",
  alias: "default",
  env: { ANTHROPIC_MODEL: "sonnet" },
} as unknown as ProfileFormValues

describe("ProfileForm", () => {
  it("seeds the fields from the initial values", () => {
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText("Name")).toHaveValue("Sonnet default")
    expect(screen.getByLabelText("Harness")).toHaveValue("claude")
    expect(screen.getByLabelText("Alias")).toHaveValue("default")
  })
  it("submits the edited values, preserving env, when saved", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    })
    fireEvent.change(screen.getByLabelText("Alias"), {
      target: { value: "fast" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Renamed",
      harnessId: "claude",
      alias: "fast",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("does not submit when the name is empty", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = mock(() => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/organisms/ProfileForm.test.tsx`
  Expected failure: `error: Cannot find module './ProfileForm'`.

- [ ] **Step 3: Implement** — `packages/ui/src/organisms/ProfileForm.tsx`

```tsx
import type {
  AliasName,
  HarnessDefinition,
  HarnessId,
  ModelAlias,
} from "@launchkit/types"
import { useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Select } from "../atoms/Select"
import { TextInput } from "../atoms/TextInput"
import { FormField } from "../molecules/FormField"

export type ProfileFormValues = {
  readonly name: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
}

export type ProfileFormProps = {
  readonly initialValues: ProfileFormValues
  readonly harnesses: readonly HarnessDefinition[]
  readonly aliases: readonly ModelAlias[]
  readonly onSubmit: (values: ProfileFormValues) => void
  readonly onCancel: () => void
}

export const ProfileForm = ({
  initialValues,
  harnesses,
  aliases,
  onSubmit,
  onCancel,
}: ProfileFormProps): ReactElement => {
  const [values, setValues] = useState<ProfileFormValues>(initialValues)
  const update = <K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ): void => setValues((prev) => ({ ...prev, [key]: value }))

  const submit = (): void => {
    if (values.name.trim() === "") return
    onSubmit(values)
  }

  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const aliasOptions = aliases.map((a) => ({ value: a.alias, label: a.alias }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <FormField id="profile-name" label="Name">
        <TextInput
          id="profile-name"
          value={values.name}
          onChange={(v) => update("name", v)}
        />
      </FormField>
      <FormField id="profile-harness" label="Harness">
        <Select
          id="profile-harness"
          value={values.harnessId}
          options={harnessOptions}
          onChange={(v) => update("harnessId", v as HarnessId)}
        />
      </FormField>
      <FormField id="profile-alias" label="Alias">
        <Select
          id="profile-alias"
          value={values.alias}
          options={aliasOptions}
          onChange={(v) => update("alias", v as AliasName)}
        />
      </FormField>
      <Button onClick={() => submit()}>Save</Button>
      <Button variant="secondary" onClick={() => onCancel()}>
        Cancel
      </Button>
    </form>
  )
}
```

Then add to `packages/ui/src/organisms/index.ts`: `export * from "./ProfileForm"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/organisms/ProfileForm.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/organisms/ProfileForm.tsx packages/ui/src/organisms/ProfileForm.test.tsx packages/ui/src/organisms/index.ts && git commit -m "feat(ui): add ProfileForm organism (U.10)"`

---

### Task U.11: `NewSessionModal` organism — grouped form with profile prefill

**Files:**
- Create: `packages/ui/src/organisms/NewSessionModal.tsx`
- Modify: `packages/ui/src/organisms/index.ts`
- Test: `packages/ui/src/organisms/NewSessionModal.test.tsx`

> Controlled, grouped launch form rendered inside `Modal`. Fields: **name** (`TextInput`), **folder** (`FolderField` — value comes from the `folder` prop, edits via local state, "Browse…" surfaces `onBrowse`), **harness** (`Select`), **alias** (`Select`). A **profile** `Select` (option `""` = "None") prefills `harnessId`/`alias`/`env` from the chosen profile into **local derived state** — but every field stays editable afterward. A "Save edits as new profile" checkbox reveals a profile-name `TextInput`; when checked, submit includes `saveAsProfile: { name }`. `onSubmit(NewSessionValues)`; `onCancel()` (also wired to the modal's `onClose`).
>
> **Focused prefill test (the load-bearing behavior):** selecting a profile populates harness/alias; then the user can still change a field and the submitted value reflects the edit, not the profile.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test"
import type {
  HarnessDefinition,
  ModelAlias,
  Profile,
} from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { NewSessionModal } from "./NewSessionModal"
import type { NewSessionValues } from "./NewSessionModal"

const profiles = [
  {
    id: "prof_a",
    name: "Sonnet default",
    harnessId: "claude",
    alias: "default",
    env: { ANTHROPIC_MODEL: "sonnet" },
  },
] as unknown as readonly Profile[]

const harnesses = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as unknown as readonly HarnessDefinition[]

const aliases = [
  { alias: "default", providerId: "p1", providerModel: "sonnet" },
  { alias: "fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelAlias[]

const baseProps = {
  open: true,
  profiles,
  harnesses,
  aliases,
  folder: "/Users/fred/app",
  onBrowse: () => {},
  onSubmit: () => {},
  onCancel: () => {},
}

describe("NewSessionModal", () => {
  it("does not render when closed", () => {
    render(<NewSessionModal {...baseProps} open={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("prefills harness, alias, and env when a profile is selected", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Profile"), {
      target: { value: "prof_a" },
    })
    expect(screen.getByLabelText("Harness")).toHaveValue("claude")
    expect(screen.getByLabelText("Alias")).toHaveValue("default")
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 1" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 1",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "default",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("keeps fields editable after a profile prefill", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Profile"), {
      target: { value: "prof_a" },
    })
    fireEvent.change(screen.getByLabelText("Alias"), {
      target: { value: "fast" },
    })
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 2" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 2",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "fast",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("includes saveAsProfile when the save checkbox is checked", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 3" },
    })
    fireEvent.click(screen.getByLabelText(/save edits as new profile/i))
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "My profile" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 3",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "default",
      env: {},
      saveAsProfile: { name: "My profile" },
    })
  })
  it("calls onBrowse when the folder Browse button is clicked", () => {
    const onBrowse = mock(() => {})
    render(<NewSessionModal {...baseProps} onBrowse={onBrowse} />)
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = mock(() => {})
    render(<NewSessionModal {...baseProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/organisms/NewSessionModal.test.tsx`
  Expected failure: `error: Cannot find module './NewSessionModal'`.

- [ ] **Step 3: Implement** — `packages/ui/src/organisms/NewSessionModal.tsx`. Folder edits track local `cwd` seeded from the `folder` prop; the first two prefill tests don't edit the folder, so submitted `cwd` equals `folder`. Defaults pick the first harness/alias so the selects are valid before any profile is chosen.

```tsx
import type {
  AliasName,
  HarnessDefinition,
  HarnessId,
  ModelAlias,
  Profile,
} from "@launchkit/types"
import { useState } from "react"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Modal } from "../atoms/Modal"
import { Select } from "../atoms/Select"
import { TextInput } from "../atoms/TextInput"
import { FolderField } from "../molecules/FolderField"
import { FormField } from "../molecules/FormField"

export type NewSessionValues = {
  readonly name: string
  readonly cwd: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
  readonly saveAsProfile?: { readonly name: string }
}

export type NewSessionModalProps = {
  readonly open: boolean
  readonly profiles: readonly Profile[]
  readonly harnesses: readonly HarnessDefinition[]
  readonly aliases: readonly ModelAlias[]
  readonly folder: string
  readonly onBrowse: () => void
  readonly onSubmit: (values: NewSessionValues) => void
  readonly onCancel: () => void
}

type FormState = {
  readonly name: string
  readonly cwd: string
  readonly profileId: string
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly env: Record<string, string>
  readonly save: boolean
  readonly saveName: string
}

export const NewSessionModal = ({
  open,
  profiles,
  harnesses,
  aliases,
  folder,
  onBrowse,
  onSubmit,
  onCancel,
}: NewSessionModalProps): ReactElement => {
  const firstHarness = (harnesses[0]?.id ?? "") as HarnessId
  const firstAlias = (aliases[0]?.alias ?? "") as AliasName
  const [state, setState] = useState<FormState>({
    name: "",
    cwd: folder,
    profileId: "",
    harnessId: firstHarness,
    alias: firstAlias,
    env: {},
    save: false,
    saveName: "",
  })

  const update = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ): void => setState((prev) => ({ ...prev, [key]: value }))

  const selectProfile = (id: string): void => {
    const profile = profiles.find((p) => p.id === id)
    if (profile === undefined) {
      update("profileId", id)
      return
    }
    setState((prev) => ({
      ...prev,
      profileId: id,
      harnessId: profile.harnessId,
      alias: profile.alias,
      env: profile.env,
    }))
  }

  const submit = (): void => {
    const values: NewSessionValues = {
      name: state.name,
      cwd: state.cwd,
      harnessId: state.harnessId,
      alias: state.alias,
      env: state.env,
      ...(state.save ? { saveAsProfile: { name: state.saveName } } : {}),
    }
    onSubmit(values)
  }

  const profileOptions = [
    { value: "", label: "None" },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ]
  const harnessOptions = harnesses.map((h) => ({ value: h.id, label: h.name }))
  const aliasOptions = aliases.map((a) => ({ value: a.alias, label: a.alias }))

  return (
    <Modal title="New session" open={open} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormField id="session-profile" label="Profile">
          <Select
            id="session-profile"
            value={state.profileId}
            options={profileOptions}
            onChange={selectProfile}
          />
        </FormField>
        <FormField id="session-name" label="Name">
          <TextInput
            id="session-name"
            value={state.name}
            onChange={(v) => update("name", v)}
          />
        </FormField>
        <FormField id="session-folder" label="Folder">
          <FolderField
            id="session-folder"
            value={state.cwd}
            onChange={(v) => update("cwd", v)}
            onBrowse={onBrowse}
          />
        </FormField>
        <FormField id="session-harness" label="Harness">
          <Select
            id="session-harness"
            value={state.harnessId}
            options={harnessOptions}
            onChange={(v) => update("harnessId", v as HarnessId)}
          />
        </FormField>
        <FormField id="session-alias" label="Alias">
          <Select
            id="session-alias"
            value={state.alias}
            options={aliasOptions}
            onChange={(v) => update("alias", v as AliasName)}
          />
        </FormField>
        <label>
          <input
            type="checkbox"
            checked={state.save}
            onChange={(e) => update("save", e.currentTarget.checked)}
          />
          Save edits as new profile
        </label>
        {state.save ? (
          <FormField id="session-save-name" label="Profile name">
            <TextInput
              id="session-save-name"
              value={state.saveName}
              onChange={(v) => update("saveName", v)}
            />
          </FormField>
        ) : null}
        <Button onClick={() => submit()}>Launch</Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </form>
    </Modal>
  )
}
```

Then add to `packages/ui/src/organisms/index.ts`: `export * from "./NewSessionModal"`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/organisms/NewSessionModal.test.tsx`

- [ ] **Step 5: Commit** — `git add packages/ui/src/organisms/NewSessionModal.tsx packages/ui/src/organisms/NewSessionModal.test.tsx packages/ui/src/organisms/index.ts && git commit -m "feat(ui): add NewSessionModal organism (U.11)"`

---

### Task U.12: Rework `AppShell` template — rail + master + detail

**Files:**
- Modify: `packages/ui/src/templates/AppShell.tsx`
- Modify: `packages/ui/src/templates/AppShell.test.tsx` (replace the old nav-based tests)
- Modify: `packages/ui/src/index.test.ts` (assert the new component names are exported)

> **Breaking rework.** The old `navItems`/`activeRoute`/`onNavigate`/`children` API is replaced by a rail + master + detail layout. The rail (a `<nav aria-label="Primary">`) holds the app icon, a Sessions `RailItem`, a Settings `RailItem` (active follows `mode`), and a proxy `StatusDot` at the bottom (`"on"` when `proxyRunning`, else `"off"`). `master` and `detail` are slots the desktop page fills (e.g. `SessionList`/`SettingsNav` in master, `TerminalPane`/settings panels in detail). Existing AppShell consumers in `apps/desktop` are updated in the desktop phase — not here.
>
> Also extend `src/index.test.ts` to assert the phase's barrel exports so the package barrel stays the single source of truth.

- [ ] **Step 1: Write the failing test** — replace the body of `packages/ui/src/templates/AppShell.test.tsx` entirely:

```tsx
import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { AppShell } from "./AppShell"

const baseProps = {
  mode: "sessions" as const,
  onModeChange: () => {},
  proxyRunning: true,
  master: <p>master pane</p>,
  detail: <p>detail pane</p>,
}

describe("AppShell", () => {
  it("renders the master and detail slots", () => {
    render(<AppShell {...baseProps} />)
    expect(screen.getByText("master pane")).toBeInTheDocument()
    expect(screen.getByText("detail pane")).toBeInTheDocument()
  })
  it("renders Sessions and Settings rail buttons", () => {
    render(<AppShell {...baseProps} />)
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
  })
  it("marks the Sessions rail button current when mode is sessions", () => {
    render(<AppShell {...baseProps} mode="sessions" />)
    expect(screen.getByRole("button", { name: "Sessions" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).not.toHaveAttribute("aria-current")
  })
  it("calls onModeChange with settings when the Settings button is clicked", () => {
    const onModeChange = mock((_m: "sessions" | "settings") => {})
    render(<AppShell {...baseProps} onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    expect(onModeChange).toHaveBeenCalledWith("settings")
  })
  it("shows the proxy status as running when proxyRunning is true", () => {
    render(<AppShell {...baseProps} proxyRunning />)
    expect(screen.getByRole("img", { name: /proxy/i })).toHaveAttribute(
      "data-color",
      "green",
    )
  })
  it("shows the proxy status as stopped when proxyRunning is false", () => {
    render(<AppShell {...baseProps} proxyRunning={false} />)
    expect(screen.getByRole("img", { name: /proxy/i })).toHaveAttribute(
      "data-color",
      "grey",
    )
  })
})
```

- [ ] **Step 2: Run test, expect RED** — `bun test packages/ui/src/templates/AppShell.test.tsx`
  Expected failure: the new tests fail to find the rail buttons / proxy status — `Unable to find an accessible element with the role "button" and name "Sessions"` — because the current `AppShell` still renders the old `navItems` link nav and accepts removed props (TypeScript also errors on `mode`/`master`/`detail` not existing on `AppShellProps`).

- [ ] **Step 3: Implement** — replace `packages/ui/src/templates/AppShell.tsx` entirely:

```tsx
import type { ReactElement, ReactNode } from "react"
import { StatusDot } from "../atoms/StatusDot"
import { RailItem } from "../molecules/RailItem"

export type AppMode = "sessions" | "settings"

export type AppShellProps = {
  readonly mode: AppMode
  readonly onModeChange: (mode: AppMode) => void
  readonly proxyRunning: boolean
  readonly master: ReactNode
  readonly detail: ReactNode
}

export const AppShell = ({
  mode,
  onModeChange,
  proxyRunning,
  master,
  detail,
}: AppShellProps): ReactElement => (
  <div>
    <nav aria-label="Primary">
      <span aria-hidden="true" data-app-icon="">
        LK
      </span>
      <ul>
        <RailItem
          label="Sessions"
          active={mode === "sessions"}
          onClick={() => onModeChange("sessions")}
        >
          <span aria-hidden="true">▦</span>
        </RailItem>
        <RailItem
          label="Settings"
          active={mode === "settings"}
          onClick={() => onModeChange("settings")}
        >
          <span aria-hidden="true">⚙</span>
        </RailItem>
      </ul>
      <StatusDot
        status={proxyRunning ? "on" : "off"}
        label={proxyRunning ? "proxy running" : "proxy stopped"}
      />
    </nav>
    <aside>{master}</aside>
    <main>{detail}</main>
  </div>
)
```

- [ ] **Step 4: Run test, expect GREEN** — `bun test packages/ui/src/templates/AppShell.test.tsx`

  Then extend `packages/ui/src/index.test.ts` to assert the new exports (add to the existing name list, keeping the old names):

```ts
import { describe, expect, it } from "bun:test"
import * as ui from "./index"

describe("@launchkit/ui barrel", () => {
  it("exports every public component when imported", () => {
    for (const name of [
      "Button",
      "TextInput",
      "Select",
      "Badge",
      "StatusDot",
      "Spinner",
      "Label",
      "Modal",
      "IconButton",
      "FormField",
      "ProviderCard",
      "AliasRow",
      "EmptyState",
      "RailItem",
      "FolderField",
      "SessionRow",
      "ProviderList",
      "AliasTable",
      "HarnessForm",
      "SessionTable",
      "SessionList",
      "SettingsNav",
      "ProfileList",
      "ProfileForm",
      "NewSessionModal",
      "AppShell",
      "SettingsLayout",
    ]) {
      expect(ui).toHaveProperty(name)
    }
  })
})
```

  Run the barrel test: `bun test packages/ui/src/index.test.ts` (GREEN — every new component reaches the package barrel through its level `index.ts`).

- [ ] **Step 5: Commit** — `git add packages/ui/src/templates/AppShell.tsx packages/ui/src/templates/AppShell.test.tsx packages/ui/src/index.test.ts && git commit -m "feat(ui): rework AppShell into rail + master + detail (U.12)"`

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test` green.
## Phase 7 — `apps/desktop` (data-aware GUI shell + backend handlers + composition)

The integration phase: wire every earlier package into the running app. Implement the
profile CRUD + `pickFolder` + `getSessionScrollback` IPC handlers, construct + inject the
file-backed scrollback store, add the native folder-picker seam, give `TerminalPane` a
read-only `replay` mode, add the `useProfiles` / `useSessionScrollback` hooks (and split
`useSessions`), then refactor `app.tsx` from a flat `Route` into a master/detail `View`
model with mounted-but-hidden live terminal panes — relocating the existing pages into
Settings sections and adding a `ProfilesPage` + General section. Task ID prefix = **`D`**.

**Prerequisites (earlier phases, assumed DONE).** The RED steps below import these names;
if any are absent the test fails to compile, which is the correct signal that an upstream
phase has not landed:
- `@launchkit/types`: `Profile = { id: ProfileId; name: string; harnessId: HarnessId; alias: AliasName; env: Record<string,string> }`,
  `ProfileId`, `HarnessId`, `AliasName`, `Session` (with optional `name?`/`cwd?`), `SessionId`,
  `HarnessDefinition`, `ModelAlias`.
- `@launchkit/pty`: `ScrollbackStore` (`append`/`read`/`close`, all `Result<…, PtyError>`),
  `createFileScrollbackStore({ dir, fs, capBytes? })`, `createBunScrollbackFs()`;
  `createTerminalManager` deps accept an injected `scrollback: ScrollbackStore`; the terminal
  launch input carries optional `name?`/`cwd?`. (`bytesToBase64`/`base64ToBytes` already ship
  from `@launchkit/pty` — see `protocol.ts`.)
- `@launchkit/ipc`: `IpcMethods`/`IpcClient`/`IpcHandlers` gain `getProfiles`, `addProfile`,
  `updateProfile`, `deleteProfile`, `pickFolder`, `getSessionScrollback`; `launchHarness`
  params gain `name?`/`cwd?`/`env?`; `getSessions` params gain `running?`/`limit?`/`offset?`.
  The FROZEN signatures (used verbatim below):
  - `getProfiles`: params `undefined` → result `Profile[]`
  - `addProfile`: params `{ name; harnessId; alias; env }` (ProfileSchema WITHOUT `id`) → result `Profile` (**handler mints `id`**)
  - `updateProfile`: params `Profile` (full, WITH `id`) → result `Profile`
  - `deleteProfile`: params `{ id: ProfileId }` → result `null` (`VoidSchema = z.null()`)
  - `pickFolder`: params `{ startingFolder?: string } | undefined` → result `{ path?: string }`
  - `getSessionScrollback`: params `{ id: SessionId }` → result `{ bytesBase64: string }`
  - `launchHarness`: params `{ id: HarnessId; alias?: AliasName; name?: string; cwd?: string; env?: Record<string,string> }` → result `{ sessionId: SessionId }`
  - `getSessions`: params `{ harnessId?; alias?; running?: boolean; limit?: number; offset?: number } | undefined` → result `Session[]`
- `@launchkit/ui` (consume these VERBATIM):
  - `type AppMode = "sessions" | "settings"`
  - `AppShell` props `{ mode: AppMode; onModeChange: (m: AppMode) => void; proxyRunning: boolean; master: ReactNode; detail: ReactNode }`
  - `SessionList` props `{ running; recent; labelFor: (s) => { harnessName; model }; selectedId?; hasMore; onSelect; onMore; onNew }`
  - `SettingsNav` props `{ sections: { key; label }[]; active: string; onSelect: (key) => void }`
  - `NewSessionModal` props `{ open; profiles; harnesses; aliases; folder; onBrowse; onSubmit: (v: NewSessionValues) => void; onCancel }`
    with `NewSessionValues = { name; cwd; harnessId; alias; env; saveAsProfile?: { name } }`
  - `ProfileList` props `{ profiles; onAdd; onEdit: (p: Profile) => void; onDelete: (id: ProfileId) => void }`
  - `ProfileForm` props `{ initialValues: ProfileFormValues; harnesses; aliases; onSubmit: (v) => void; onCancel }`
    with `ProfileFormValues = { name; harnessId; alias; env }`
  - `Modal` props `{ title; open; onClose; children }`
- `@launchkit/config`: `Config.profiles: Profile[]`.

**Conventions (apply to every task).** TS strict, **no `any`** (cast unavoidable test fakes
through `as unknown as T`, never `as any`); explicit input/output types on every function.
Effects stay behind injected seams — Electrobun is reached ONLY through a LAZY dynamic
`import("electrobun/bun")` (mirroring `gui/window.ts`/`gui/tray.ts`) so `bun test` never loads
native FFI; the `pickFolder` closure lives in `composition.ts`, NOT inline in the handler, so
handler tests stay headless. Backend returns the result shape or throws (a handler throw
becomes the ipc `handler-failed` error; `fail(msg): never` is the existing helper).
**Dumb components never fetch — data enters at the view level via hooks.** TDD only: `bun test`
with the Jest API, `*.test.ts(x)` colocated, React tests render under happy-dom via
`@testing-library/react`, handler tests drive the in-memory `AppContext` fake from
`handlers.test.ts`. RED → GREEN → REFACTOR.

**Test-pattern anchors (read once, mirror exactly):**
- Handler tests extend `makeCtx(...)` (the in-memory `AppContext` fake in
  `apps/desktop/src/gui/ipc/handlers.test.ts`, recording `saves`, capturing `terminalInputs`).
  `baseConfig` currently OMITS `profiles`; the profile tests add it.
- View/hook tests use `createFakeIpcClient(stubs)` from
  `apps/desktop/views/main/test/fake-client.ts` wrapped in `IpcClientProvider`, asserting via
  `client.calls.<method>`. **The fake-client `METHOD_NAMES` array must gain the six new method
  names** (Task D.5) or hooks calling them hit the "unstubbed" `handler-failed` path.
- Composition wiring is pinned by `apps/desktop/src/composition.test.ts` (recording fake
  constructors via `makeFakeDeps`).

> **Eyes-on (cannot be unit-tested):** the live xterm round-trip (real PTY bytes rendered in a
> real window), the read-only replay pane against a finished session, and the native folder
> dialog must be verified by hand. Each task that touches them adds a checklist line to
> `apps/desktop/MANUAL-VERIFICATION.md`; `apps/desktop/scripts/smoke.sh` must still exit 0.

---

### Task D.1: `getProfiles` / `addProfile` / `updateProfile` / `deleteProfile` handlers

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts` (add the four handlers to the returned object, after the `// ── Aliases ──` block, ~`:162`)
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`

`addProfile` mints a `ProfileId` the SAME way `addProvider` mints a provider id —
`crypto.randomUUID()` with a typed prefix (`addProvider` uses
``id: `p_${crypto.randomUUID()}` as Provider["id"]``). Mirror it as
``id: `pr_${crypto.randomUUID()}` as ProfileId``. No id-gen seam exists on `AppContext`; the
existing handler uses `crypto` directly, so the new one does too. To keep the minted id
assertable, the test stubs `crypto.randomUUID`. `updateProfile` takes a FULL `Profile`
(params = `Profile`, not `{id, input}`): replace by `id`, 404-style via `fail(...)` if the id
is absent (mirroring `updateProvider`'s `existing === undefined → fail`). `deleteProfile`
returns `null`. Profiles live on `config.profiles`; load → mutate → save, exactly like the
alias CRUD handlers.

- [ ] **Step 1: Write the failing test** — append to `handlers.test.ts`. First repair
  `baseConfig` to seed the new top-level array so the fake matches the `Config` shape (and
  bump the version field to match the current config — leave the rest unchanged):
  ```ts
  const baseConfig = (providers: readonly Provider[]): Config =>
    ({
      version: 2,
      providers,
      aliases: [],
      profiles: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }) as Config
  ```
  Then append the suites (note the EXACT `Profile` shape `{ id, name, harnessId, alias, env }`):
  ```ts
  import type { Profile } from "@launchkit/types"

  const sampleProfile: Profile = {
    id: "pr_default" as Profile["id"],
    name: "Default",
    harnessId: "claude" as Profile["harnessId"],
    alias: "fast" as Profile["alias"],
    env: {},
  }

  describe("createIpcHandlers.getProfiles", () => {
    it("returns the profiles from the loaded config when listing", async () => {
      const { ctx } = makeCtx()
      // Seed one profile into the fake's config via a save.
      await ctx.config.save({
        ...(await ctx.config.load()).value,
        profiles: [sampleProfile],
      } as Config)
      const handlers = createIpcHandlers(ctx)

      expect(await handlers.getProfiles(undefined)).toEqual([sampleProfile])
    })

    it("returns an empty list when the config has no profiles", async () => {
      const { ctx } = makeCtx()
      const handlers = createIpcHandlers(ctx)
      expect(await handlers.getProfiles(undefined)).toEqual([])
    })
  })

  describe("createIpcHandlers.addProfile", () => {
    it("mints a pr_-prefixed id and persists the new profile when adding", async () => {
      const original = crypto.randomUUID
      ;(crypto as { randomUUID: () => string }).randomUUID = () => "fixed-uuid"
      try {
        const { ctx, saves } = makeCtx()
        const handlers = createIpcHandlers(ctx)

        const created = await handlers.addProfile({
          name: "Work",
          harnessId: "claude" as Profile["harnessId"],
          alias: "fast" as Profile["alias"],
          env: { EXTRA: "1" },
        })

        expect(created.id).toBe("pr_fixed-uuid")
        expect(created.name).toBe("Work")
        expect(created.harnessId).toBe("claude")
        expect(created.alias).toBe("fast")
        expect(created.env).toEqual({ EXTRA: "1" })
        expect(saves).toHaveLength(1)
        expect(saves[0]?.profiles).toEqual([created])
      } finally {
        ;(crypto as { randomUUID: () => string }).randomUUID = original
      }
    })

    it("throws so the server surfaces handler-failed when the save fails", async () => {
      const { ctx } = makeCtx()
      // Make save fail by swapping it for an err-returning stub.
      ;(ctx.config as { save: unknown }).save = async () =>
        err({ kind: "write-failed" })
      const handlers = createIpcHandlers(ctx)

      await expect(
        handlers.addProfile({
          name: "X",
          harnessId: "claude" as Profile["harnessId"],
          alias: "fast" as Profile["alias"],
          env: {},
        }),
      ).rejects.toThrow()
    })
  })

  describe("createIpcHandlers.updateProfile", () => {
    it("replaces the matching profile and returns the full updated record", async () => {
      const { ctx, saves } = makeCtx()
      await ctx.config.save({
        ...(await ctx.config.load()).value,
        profiles: [sampleProfile],
      } as Config)
      const handlers = createIpcHandlers(ctx)

      const next: Profile = {
        id: sampleProfile.id,
        name: "Renamed",
        harnessId: "codex" as Profile["harnessId"],
        alias: "smart" as Profile["alias"],
        env: { TOKEN: "z" },
      }
      const updated = await handlers.updateProfile(next)

      expect(updated).toEqual(next)
      const saved = saves.at(-1)?.profiles.find((p) => p.id === sampleProfile.id)
      expect(saved).toEqual(next)
    })

    it("throws when updateProfile targets an id that does not exist", async () => {
      const { ctx } = makeCtx()
      const handlers = createIpcHandlers(ctx)
      await expect(
        handlers.updateProfile({
          id: "pr_ghost" as Profile["id"],
          name: "X",
          harnessId: "claude" as Profile["harnessId"],
          alias: "fast" as Profile["alias"],
          env: {},
        }),
      ).rejects.toThrow()
    })
  })

  describe("createIpcHandlers.deleteProfile", () => {
    it("removes the profile and returns null on success", async () => {
      const { ctx, saves } = makeCtx()
      await ctx.config.save({
        ...(await ctx.config.load()).value,
        profiles: [sampleProfile],
      } as Config)
      const handlers = createIpcHandlers(ctx)

      const result = await handlers.deleteProfile({ id: sampleProfile.id })

      expect(result).toBeNull()
      expect(saves.at(-1)?.profiles).toEqual([])
    })
  })
  ```
  (`err` is already imported from `@launchkit/utils` at the top of `handlers.test.ts`.)

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`
  → fails: `handlers.getProfiles`/`addProfile`/… are not functions, plus TS errors on the
  missing `IpcHandlers` keys.

- [ ] **Step 3: Implement** — in `handlers.ts`, add the import and a `// ── Profiles ──` block
  to the returned object (place it directly after the `deleteAlias` handler, mirroring the alias
  CRUD shape):
  ```ts
  import type { Profile, ProfileId } from "@launchkit/types"

  // ── Profiles ─────────────────────────────────────────────────────────────────────────
  getProfiles: async () => {
    const config = await loadConfig()
    return config.profiles
  },

  addProfile: async (input) => {
    const config = await loadConfig()
    // Mint the id the same way addProvider mints provider ids (crypto.randomUUID + typed prefix).
    const profile: Profile = {
      id: `pr_${crypto.randomUUID()}` as ProfileId,
      name: input.name,
      harnessId: input.harnessId,
      alias: input.alias,
      env: input.env,
    }
    const saved = await ctx.config.save({
      ...config,
      profiles: [...config.profiles, profile],
    })
    if (!isOk(saved)) return fail("could not save profile")
    return profile
  },

  updateProfile: async (profile) => {
    const config = await loadConfig()
    const existing = config.profiles.find((p) => p.id === profile.id)
    if (existing === undefined) return fail(`unknown profile: ${String(profile.id)}`)
    const profiles = config.profiles.map((p) => (p.id === profile.id ? profile : p))
    const saved = await ctx.config.save({ ...config, profiles })
    if (!isOk(saved)) return fail("could not save profile")
    return profile
  },

  deleteProfile: async ({ id }) => {
    const config = await loadConfig()
    const profiles = config.profiles.filter((p) => p.id !== id)
    const saved = await ctx.config.save({ ...config, profiles })
    if (!isOk(saved)) return fail("could not delete profile")
    return null
  },
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`

- [ ] **Step 5: Commit** — `git add apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/ipc/handlers.test.ts && git commit -m "feat(desktop): profiles CRUD ipc handlers (D.1)"`

---

### Task D.2: `pickFolder` handler (native dialog behind a lazy seam)

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts`; `apps/desktop/src/composition.ts` (add `pickFolder` to `AppContext`)
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`

The native dialog is an effect, so it cannot live inline in the handler (the handler test must
run headless). Add `pickFolder` to `AppContext` as an injected async function
``(opts: { startingFolder?: string }) => Promise<readonly string[]>``; `composition.ts` wires
it to a LAZY `import("electrobun/bun")` so `bun test` never loads native FFI. The handler
result type is `{ path?: string }`: it calls the seam and maps `[]` → `{}`, else `{ path: first }`.

- [ ] **Step 1: Write the failing test** — extend `makeCtx`'s `over` with an optional
  `pickFolderResult?: readonly string[]`, wire it into the fake ctx and record the calls, and
  return a new `pickFolderCalls: unknown[]` from `makeCtx`:
  ```ts
  // in over:        pickFolderResult?: readonly string[]
  // declare:        const pickFolderCalls: unknown[] = []
  // in the ctx obj: pickFolder: async (opts: unknown) => {
  //                   pickFolderCalls.push(opts)
  //                   return over.pickFolderResult ?? []
  //                 },
  // and return pickFolderCalls alongside the others.
  ```
  Then append:
  ```ts
  describe("createIpcHandlers.pickFolder", () => {
    it("returns the first selected path when the dialog resolves a folder", async () => {
      const { ctx, pickFolderCalls } = makeCtx({
        pickFolderResult: ["/Users/me/project"],
      })
      const handlers = createIpcHandlers(ctx)

      const result = await handlers.pickFolder({ startingFolder: "/Users/me" })

      expect(result).toEqual({ path: "/Users/me/project" })
      expect(pickFolderCalls).toEqual([{ startingFolder: "/Users/me" }])
    })

    it("returns an empty object when the dialog is cancelled (no selection)", async () => {
      const { ctx } = makeCtx({ pickFolderResult: [] })
      const handlers = createIpcHandlers(ctx)
      expect(await handlers.pickFolder({})).toEqual({})
    })

    it("returns an empty object when params are undefined", async () => {
      const { ctx } = makeCtx({ pickFolderResult: [] })
      const handlers = createIpcHandlers(ctx)
      expect(await handlers.pickFolder(undefined)).toEqual({})
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`
  → `handlers.pickFolder` is not a function.

- [ ] **Step 3: Implement** —
  In `handlers.ts` (params can be `undefined`, so default it):
  ```ts
  pickFolder: async (params) => {
    const startingFolder = params?.startingFolder
    const selected = await ctx.pickFolder(
      startingFolder === undefined ? {} : { startingFolder },
    )
    const first = selected[0]
    return first === undefined ? {} : { path: first }
  },
  ```
  In `composition.ts`, add to `AppContext`:
  ```ts
  /**
   * Open the native folder picker (Electrobun `Utils.openFileDialog`, directories only). Reached via
   * a LAZY dynamic import so `bun test` never loads native FFI; resolves the selected paths ([] if
   * cancelled). The `pickFolder` IPC handler maps the first path to `{ path }` (or `{}`).
   */
  readonly pickFolder: (opts: {
    readonly startingFolder?: string
  }) => Promise<readonly string[]>
  ```
  and define the default impl in `createAppContext` + wire it into the return object (the
  wiring assertion lands in D.6):
  ```ts
  const pickFolder: AppContext["pickFolder"] = async (opts) => {
    const { Utils } = await import("electrobun/bun")
    return Utils.openFileDialog({
      canChooseDirectory: true,
      canChooseFiles: false,
      allowsMultipleSelection: false,
      ...(opts.startingFolder === undefined
        ? {}
        : { startingFolder: opts.startingFolder }),
    })
  }
  ```
  Return `pickFolder` from `createAppContext`. (The `Utils.openFileDialog` type is added in
  Task D.3; until then the typecheck flags it — land D.3 in the same change-set or before the
  phase gate.)

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`

- [ ] **Step 5: Commit** — `git add apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/ipc/handlers.test.ts apps/desktop/src/composition.ts && git commit -m "feat(desktop): pickFolder ipc handler over lazy electrobun dialog seam (D.2)"`

---

### Task D.3: type the Electrobun `Utils.openFileDialog` surface

**Files:**
- Modify: `apps/desktop/src/types/electrobun-bun.d.ts:81` (append after the `Tray` class)
- Test: (type-only; no runtime test — verified by `bun run typecheck` and D.2 compiling)

This file is the local `.d.ts` mapped onto `"electrobun/bun"` for type resolution only (see its
header). Extend it with the `Utils` namespace so the lazy import in `composition.ts` typechecks
under strict + `exactOptionalPropertyTypes`.

- [ ] **Step 1: Write the failing test** — no unit test (declaration-only). The RED signal is
  `bun run typecheck` reporting `Utils` has no exported member on `"electrobun/bun"` (already
  triggered by D.2's `composition.ts`). Record that as the failing observation.

- [ ] **Step 2: Run test, expect RED** — `bun run typecheck`
  → error in `composition.ts`: `Module '"electrobun/bun"' has no exported member 'Utils'`.

- [ ] **Step 3: Implement** — append to `electrobun-bun.d.ts`:
  ```ts
  /** Options for the native open dialog. `exactOptionalPropertyTypes`-safe (no `| undefined`). */
  export interface OpenFileDialogOptions {
    canChooseDirectory?: boolean
    canChooseFiles?: boolean
    allowsMultipleSelection?: boolean
    startingFolder?: string
  }

  /** Subset of the Electrobun bun-side `Utils` namespace we consume. */
  export const Utils: {
    /** Native open panel; resolves the selected paths (empty array if cancelled). */
    openFileDialog(options?: OpenFileDialogOptions): Promise<string[]>
  }
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun run typecheck` (clean for this file; D.2 now compiles)

- [ ] **Step 5: Commit** — `git add apps/desktop/src/types/electrobun-bun.d.ts && git commit -m "feat(desktop): type Utils.openFileDialog on the electrobun/bun seam (D.3)"`

---

### Task D.4: `getSessionScrollback` handler (base64 the bytes)

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts`; `apps/desktop/src/composition.ts` (add `readScrollback` to `AppContext`)
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`

Replay needs the finished session's captured bytes. Expose the scrollback store's `read` on
`AppContext` as ``readScrollback: (id: SessionId) => Result<Uint8Array, PtyError>`` (the store
is constructed + injected in D.6). The handler reads, base64-encodes with `bytesToBase64` from
`@launchkit/pty` (reuse the package codec — no ad-hoc `Buffer`), and returns the FROZEN result
shape `{ bytesBase64: <base64> }`. A read error throws → `handler-failed`.

- [ ] **Step 1: Write the failing test** — extend `makeCtx`'s `over` with
  `scrollback?: Result<Uint8Array, { kind: string }>`, wire `readScrollback` into the fake ctx
  capturing the requested id, and return `readScrollbackIds: string[]`:
  ```ts
  // in over:        scrollback?: Result<Uint8Array, { readonly kind: string }>
  // declare:        const readScrollbackIds: string[] = []
  // in the ctx obj: readScrollback: (id: unknown) => {
  //                   readScrollbackIds.push(id as string)
  //                   return over.scrollback ?? ok(new Uint8Array())
  //                 },
  // and return readScrollbackIds alongside the others.
  ```
  Then append:
  ```ts
  import { bytesToBase64 } from "@launchkit/pty"

  describe("createIpcHandlers.getSessionScrollback", () => {
    it("base64-encodes the session's captured bytes into bytesBase64 when reading scrollback", async () => {
      const bytes = new Uint8Array([0, 65, 200, 255]) // includes 0 and > 127
      const { ctx, readScrollbackIds } = makeCtx({ scrollback: ok(bytes) })
      const handlers = createIpcHandlers(ctx)

      const result = await handlers.getSessionScrollback({ id: "s_1" as never })

      expect(result).toEqual({ bytesBase64: bytesToBase64(bytes) })
      expect(readScrollbackIds).toEqual(["s_1"])
    })

    it("throws so the server surfaces handler-failed when the read fails", async () => {
      const { ctx } = makeCtx({ scrollback: err({ kind: "not-found" }) })
      const handlers = createIpcHandlers(ctx)
      await expect(
        handlers.getSessionScrollback({ id: "s_x" as never }),
      ).rejects.toThrow()
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`
  → `handlers.getSessionScrollback` is not a function.

- [ ] **Step 3: Implement** —
  In `handlers.ts` (add the import + handler):
  ```ts
  import { bytesToBase64 } from "@launchkit/pty"

  getSessionScrollback: async ({ id }) => {
    const read = ctx.readScrollback(id)
    if (!isOk(read)) return fail("could not read session scrollback")
    return { bytesBase64: bytesToBase64(read.value) }
  },
  ```
  In `composition.ts` `AppContext`:
  ```ts
  /**
   * Read a session's captured terminal bytes from the file-backed scrollback store, for the read-only
   * replay pane. Returns the raw bytes; the `getSessionScrollback` handler base64-encodes them.
   */
  readonly readScrollback: (
    id: import("@launchkit/types").SessionId,
  ) => Result<Uint8Array, import("@launchkit/pty").PtyError>
  ```
  (Wired to `scrollbackStore.read` in D.6.)

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`

- [ ] **Step 5: Commit** — `git add apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/ipc/handlers.test.ts apps/desktop/src/composition.ts && git commit -m "feat(desktop): getSessionScrollback ipc handler (D.4)"`

---

### Task D.5: thread `name`/`cwd`/`env` into `launchHarness` and `running`/`limit`/`offset` into `getSessions`

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts:196` (`launchHarness`), `:232` (`getSessions`); `apps/desktop/views/main/test/fake-client.ts:17` (`METHOD_NAMES`)
- Test: `apps/desktop/src/gui/ipc/handlers.test.ts`

`launchHarness` merges caller `env` ON TOP of the rendered proxy env and forwards the optional
`name`/`cwd` straight into `ctx.terminal.launch(...)` (the manager already accepts optional
`name`/`cwd`). `getSessions` already builds a `SessionFilter` by stripping `undefined` keys —
`running`/`limit`/`offset` flow through that same `Object.fromEntries` path with NO code change,
so the test just pins it. Also add the six new method names to the fake-client `METHOD_NAMES`
so D.7+ hook tests can stub them.

- [ ] **Step 1: Write the failing test** — append to `handlers.test.ts`:
  ```ts
  describe("createIpcHandlers.launchHarness (session metadata)", () => {
    it("threads name, cwd, and extra env into terminal.launch", async () => {
      const { ctx, terminalInputs } = makeCtx({ providers: [provider()] })
      const handlers = createIpcHandlers(ctx)

      await handlers.launchHarness({
        id: "claude" as never,
        name: "refactor run",
        cwd: "/work/repo",
        env: { EXTRA: "1" },
      })

      const input = terminalInputs[0] as {
        name?: string
        cwd?: string
        env: Record<string, string>
      }
      expect(input.name).toBe("refactor run")
      expect(input.cwd).toBe("/work/repo")
      // Caller env is merged ON TOP of the rendered proxy env.
      expect(input.env.EXTRA).toBe("1")
      expect(input.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000")
    })

    it("omits name/cwd when not supplied (exactOptionalPropertyTypes safe)", async () => {
      const { ctx, terminalInputs } = makeCtx({ providers: [provider()] })
      const handlers = createIpcHandlers(ctx)

      await handlers.launchHarness({ id: "claude" as never })

      const input = terminalInputs[0] as Record<string, unknown>
      expect("name" in input).toBe(false)
      expect("cwd" in input).toBe(false)
    })
  })

  describe("createIpcHandlers.getSessions (running + pagination)", () => {
    it("passes running, limit, and offset through to sessions.query", async () => {
      const queries: unknown[] = []
      const { ctx } = makeCtx()
      ;(ctx.sessions as { query: unknown }).query = (filter: unknown) => {
        queries.push(filter)
        return ok([sampleSession])
      }
      const handlers = createIpcHandlers(ctx)

      await handlers.getSessions({ running: true, limit: 20, offset: 40 })

      expect(queries[0]).toEqual({ running: true, limit: 20, offset: 40 })
    })

    it("drops undefined keys from the filter", async () => {
      const queries: unknown[] = []
      const { ctx } = makeCtx()
      ;(ctx.sessions as { query: unknown }).query = (filter: unknown) => {
        queries.push(filter)
        return ok([])
      }
      const handlers = createIpcHandlers(ctx)

      await handlers.getSessions({ running: undefined })

      expect(queries[0]).toEqual({})
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`
  → the `name`/`cwd`/`env` assertions fail (current `launchHarness` drops them). The
  running/limit/offset assertions need the frozen `getSessions` params contract to typecheck,
  then pass once `launchHarness` is updated (no change needed to `getSessions` itself).

- [ ] **Step 3: Implement** — replace `launchHarness` in `handlers.ts`:
  ```ts
  launchHarness: async ({ id, alias, name, cwd, env }) => {
    const config = await loadConfig()
    const listed = await ctx.registry.list()
    if (!isOk(listed)) return fail("could not list harnesses")
    const harness = listed.value.find((h) => h.id === id)
    if (harness === undefined) return fail(`unknown harness: ${String(id)}`)

    const resolvedAlias = alias ?? harness.defaultAlias
    const proxyUrl = `http://${config.settings.proxyHost}:${config.settings.proxyPort}`
    const proxyKey = (await ctx.runtime.readProxyKey()) ?? ctx.genProxyKey()

    const resolved = ctx.resolveLaunch({
      harness,
      proxyUrl,
      proxyKey,
      model: resolvedAlias,
    })
    if (!isOk(resolved)) return fail("failed to resolve harness launch")

    // Merge caller-supplied env ON TOP of the rendered proxy env (caller may add tokens/flags), and
    // thread the optional session metadata through. The manager owns Session creation.
    const opened = ctx.terminal.launch({
      harnessId: harness.id,
      alias: resolvedAlias,
      command: resolved.value.command,
      args: resolved.value.args,
      env: { ...resolved.value.env, ...(env ?? {}) },
      ...(name === undefined ? {} : { name }),
      ...(cwd === undefined ? {} : { cwd }),
    })
    if (!isOk(opened)) return fail("failed to launch harness")
    return { sessionId: opened.value.sessionId }
  },
  ```
  (Spread the optionals so `exactOptionalPropertyTypes` is satisfied — never pass
  `name: undefined`.) `getSessions` needs NO change: the existing `Object.fromEntries` filter
  already passes the new keys through; keep it as-is.

  In `fake-client.ts`, extend `METHOD_NAMES` (append the six new names before the closing
  `] as const satisfies …`):
  ```ts
  const METHOD_NAMES = [
    // ...existing names through "getProxyStatus" ...
    "getProfiles",
    "addProfile",
    "updateProfile",
    "deleteProfile",
    "pickFolder",
    "getSessionScrollback",
  ] as const satisfies ReadonlyArray<keyof IpcClient>
  ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/src/gui/ipc/handlers.test.ts`

- [ ] **Step 5: Commit** — `git add apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/ipc/handlers.test.ts apps/desktop/views/main/test/fake-client.ts && git commit -m "feat(desktop): thread session metadata + pagination through launch/getSessions; widen fake client (D.5)"`

---

### Task D.6: construct + inject the file scrollback store; wire `pickFolder` + `readScrollback`

**Files:**
- Modify: `apps/desktop/src/composition.ts` (`@launchkit/pty` import, `CreateAppContextDeps`/`realDeps`, `createAppContext` body + return)
- Test: `apps/desktop/src/composition.test.ts`

Build `createFileScrollbackStore({ dir: <configDir>/scrollback, fs: createBunScrollbackFs() })`,
pass it into `createTerminalManager` as `scrollback`, expose its `read` as `ctx.readScrollback`,
and return `pickFolder` (D.2). Composition stays FLAT — only `create*` calls + the lazy
`pickFolder` closure already defined in D.2.

- [ ] **Step 1: Write the failing test** — extend `makeFakeDeps` with the two new recording
  constructors. Add to the `deps` object:
  ```ts
  createBunScrollbackFs: record("createBunScrollbackFs") as never,
  createFileScrollbackStore: ((..._a: unknown[]) => {
    calls.createFileScrollbackStore = _a
    return { read: () => ok(new Uint8Array()) }
  }) as never,
  ```
  Then append the assertions:
  ```ts
  it("builds the file scrollback store under the config dir and injects it into the terminal manager", () => {
    const { deps, calls } = makeFakeDeps()
    const ctx = createAppContext(deps)

    expect((calls.createFileScrollbackStore?.[0] as { dir: string }).dir).toContain(
      "/home/tester/.config/launchkit/scrollback",
    )
    expect((calls.createFileScrollbackStore?.[0] as { fs: unknown }).fs).toEqual({
      __stub: "createBunScrollbackFs",
    })
    const managerArgs = calls.createTerminalManager?.[0] as { scrollback: unknown }
    expect(managerArgs.scrollback).toEqual({ read: expect.any(Function) })
    // The store's read is exposed for the scrollback handler.
    expect(typeof ctx.readScrollback).toBe("function")
  })

  it("exposes a pickFolder function on the context", () => {
    const { deps } = makeFakeDeps()
    const ctx = createAppContext(deps)
    expect(typeof ctx.pickFolder).toBe("function")
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/src/composition.test.ts`
  → `calls.createFileScrollbackStore` is undefined / `ctx.readScrollback` is not a function.

- [ ] **Step 3: Implement** — in `composition.ts`:
  - Add to the `@launchkit/pty` import: `createFileScrollbackStore`, `createBunScrollbackFs`.
  - Add both to `CreateAppContextDeps` and `realDeps`:
    ```ts
    readonly createFileScrollbackStore: typeof createFileScrollbackStore
    readonly createBunScrollbackFs: typeof createBunScrollbackFs
    ```
  - In `createAppContext`, after `harnessDir`:
    ```ts
    const scrollbackDir = join(configDir, "scrollback")
    ```
  - Before the terminal manager, construct the store and inject it (replacing the existing
    `createTerminalManager` call):
    ```ts
    // Persisted per-session scrollback (read-only replay reads from here after a session ends).
    const scrollbackStore = deps.createFileScrollbackStore({
      dir: scrollbackDir,
      fs: deps.createBunScrollbackFs(),
    })

    const terminal = deps.createTerminalManager({
      pty: deps.createFfiPty(),
      sessions: { create: sessions.create, close: sessions.close },
      send: () => {},
      capBytes: 1_000_000,
      defaultSize: { cols: 80, rows: 24 },
      scrollback: scrollbackStore,
    })
    ```
  - Define the `pickFolder` closure (from D.2) above the return, and add both to the returned
    object:
    ```ts
    return {
      // ...existing fields...
      pickFolder,
      readScrollback: scrollbackStore.read,
      paths: { configFile, dbFile, harnessDir },
    }
    ```

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/src/composition.test.ts`

- [ ] **Step 5: Commit** — `git add apps/desktop/src/composition.ts apps/desktop/src/composition.test.ts && git commit -m "feat(desktop): construct + inject file scrollback store; expose readScrollback/pickFolder (D.6)"`

---

### Task D.7: `TerminalPane` read-only `replay` mode

**Files:**
- Modify: `apps/desktop/views/main/terminal/TerminalPane.tsx`
- Test: `apps/desktop/views/main/terminal/TerminalPane.test.tsx` (new)

Add a discriminated `mode` prop. In `"live"` (default) the pane behaves exactly as today
(wires `client.onData`/`onExit`/`onData`→input, attaches, resizes). In `"replay"` it does NOT
wire `term.onData` or any PTY input/attach/resize; it writes a provided `bytes: Uint8Array`
once and is otherwise inert (read-only). The injected `XtermInstance` seam is unchanged, so the
test uses a fake xterm (no real xterm/CSS).

- [ ] **Step 1: Write the failing test** — new file:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { render } from "@testing-library/react"
  import type { SessionId } from "@launchkit/types"
  import { TerminalPane, type XtermInstance } from "./TerminalPane"
  import type { TerminalClient } from "./terminalClient"

  const fakeClient = (calls: string[]): TerminalClient =>
    ({
      onData: () => calls.push("onData"),
      onExit: () => calls.push("onExit"),
      sendInput: () => calls.push("sendInput"),
      sendResize: () => calls.push("sendResize"),
      attach: () => calls.push("attach"),
      kill: () => calls.push("kill"),
      dispatch: () => {},
    }) as unknown as TerminalClient

  describe("TerminalPane replay mode", () => {
    it("writes the provided bytes once and does not wire onData or attach in replay mode", () => {
      const writes: Array<string | Uint8Array> = []
      let wiredOnData = false
      const term: XtermInstance = {
        open: () => {},
        write: (d) => writes.push(d),
        onData: () => {
          wiredOnData = true
        },
        fit: () => ({ cols: 80, rows: 24 }),
        cols: 80,
        rows: 24,
        dispose: () => {},
      }
      const calls: string[] = []
      const bytes = new Uint8Array([1, 2, 3])

      render(
        <TerminalPane
          mode="replay"
          sessionId={"s_1" as SessionId}
          client={fakeClient(calls)}
          createTerminal={() => term}
          bytes={bytes}
        />,
      )

      expect(writes).toContainEqual(bytes)
      expect(wiredOnData).toBe(false)
      expect(calls).not.toContain("attach")
      expect(calls).not.toContain("sendInput")
      expect(calls).not.toContain("onData")
    })

    it("wires the live stream and attaches in live mode (default)", () => {
      const term: XtermInstance = {
        open: () => {},
        write: () => {},
        onData: () => {},
        fit: () => ({ cols: 80, rows: 24 }),
        cols: 80,
        rows: 24,
        dispose: () => {},
      }
      const calls: string[] = []
      render(
        <TerminalPane
          mode="live"
          sessionId={"s_1" as SessionId}
          client={fakeClient(calls)}
          createTerminal={() => term}
        />,
      )
      expect(calls).toContain("onData")
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/terminal/TerminalPane.test.tsx`
  → fails: `mode`/`bytes` are not valid props; the live wiring runs unconditionally.

- [ ] **Step 3: Implement** — change the props to a union + branch the effect in
  `TerminalPane.tsx`. Replace the `TerminalPaneProps` type and the component signature so it
  reads from a `props` union:
  ```tsx
  export type TerminalPaneProps =
    | {
        readonly mode?: "live"
        readonly sessionId: SessionId
        readonly client: TerminalClient
        readonly createTerminal: CreateTerminal
      }
    | {
        readonly mode: "replay"
        readonly sessionId: SessionId
        readonly client: TerminalClient
        readonly createTerminal: CreateTerminal
        /** The decoded scrollback bytes to render once, read-only. */
        readonly bytes: Uint8Array
      }

  export const TerminalPane = (props: TerminalPaneProps): ReactElement => {
    const { sessionId, client, createTerminal } = props
    const replayBytes = props.mode === "replay" ? props.bytes : undefined
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const container = containerRef.current
      if (container === null) return

      const term = createTerminal()
      term.open(container)

      if (replayBytes !== undefined) {
        // Read-only: render the captured bytes once. No onData (no input), no attach, no resize wiring —
        // the session has ended; we are just showing its final output.
        term.write(replayBytes)
        return () => {
          term.dispose()
        }
      }

      // ── live (existing behaviour) ──
      client.onData(sessionId, (bytes) => term.write(bytes))
      // ...the rest of the existing live effect body, UNCHANGED...
    }, [sessionId, client, createTerminal, replayBytes])

    return (
      <div ref={containerRef} className="terminal-pane" data-session={sessionId} />
    )
  }
  ```
  Keep the existing live effect body (onExit, term.onData→input, syncSize, raf/settle,
  ResizeObserver, cleanup) verbatim under the live branch; only the early replay return is new.
  The dependency array adds `replayBytes`.

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/terminal/TerminalPane.test.tsx`

- [ ] **Step 5: Commit** — `git add apps/desktop/views/main/terminal/TerminalPane.tsx apps/desktop/views/main/terminal/TerminalPane.test.tsx && git commit -m "feat(desktop): read-only replay mode for TerminalPane (D.7)"`

> Add to `apps/desktop/MANUAL-VERIFICATION.md`: "Open a finished session → its detail shows the
> read-only replay pane with the captured output and accepts no keystrokes."

---

### Task D.8: `useProfiles`, `useSessionScrollback`, and the `useSessions` running/paginated split

**Files:**
- Create: `apps/desktop/views/main/hooks/useProfiles.ts`, `apps/desktop/views/main/hooks/useSessionScrollback.ts`
- Modify: `apps/desktop/views/main/hooks/index.ts`
- Test: `apps/desktop/views/main/hooks/useProfiles.test.tsx` (new), `apps/desktop/views/main/hooks/useSessionScrollback.test.tsx` (new), `apps/desktop/views/main/hooks/useSessions.test.tsx`

`useProfiles` returns the async-resource list of `Profile` PLUS CRUD methods that call the
client then `refetch` (`useProviders` is the read-only mirror; the CRUD wrap mirrors
`ProvidersPage`'s `addProvider → refetch`). The actions use the FROZEN signatures:
`add(input: { name; harnessId; alias; env })`, `update(p: Profile)` (a FULL profile, since
`updateProfile`'s params ARE a `Profile`), `remove(id: ProfileId)`.
`useSessionScrollback(id)` fetches `getSessionScrollback` and base64-DECODES `bytesBase64` via
`base64ToBytes` so the replay pane gets `Uint8Array`. `useSessions` already forwards an
arbitrary filter — the new `running`/`limit`/`offset` keys ride the existing
`SessionsFilter = IpcMethods["getSessions"]["params"]` with no change; add a test pinning the
running split.

- [ ] **Step 1: Write the failing test** —
  `useProfiles.test.tsx`:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { fireEvent, render, screen, waitFor } from "@testing-library/react"
  import type { Profile } from "@launchkit/types"
  import { IpcClientProvider } from "../IpcClientContext"
  import { createFakeIpcClient } from "../test/fake-client"
  import { useProfiles } from "./useProfiles"

  const profile: Profile = {
    id: "pr_1" as Profile["id"],
    name: "Work",
    harnessId: "claude" as Profile["harnessId"],
    alias: "fast" as Profile["alias"],
    env: {},
  }

  const Probe = (): JSX.Element => {
    const { data, add } = useProfiles()
    return (
      <div>
        <span>{data === undefined ? "no-data" : `count:${data.length}`}</span>
        <button
          type="button"
          onClick={() =>
            void add({
              name: "New",
              harnessId: "claude" as Profile["harnessId"],
              alias: "fast" as Profile["alias"],
              env: {},
            })
          }
        >
          add
        </button>
      </div>
    )
  }

  describe("useProfiles", () => {
    it("loads profiles via getProfiles", async () => {
      const client = createFakeIpcClient({
        getProfiles: async () => ({ ok: true, value: [profile] }),
      })
      render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
      await waitFor(() => expect(screen.getByText("count:1")).toBeInTheDocument())
    })

    it("calls addProfile then refetches when add is invoked", async () => {
      const client = createFakeIpcClient({
        getProfiles: async () => ({ ok: true, value: [] }),
        addProfile: async () => ({ ok: true, value: profile }),
      })
      render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
      await waitFor(() => expect(screen.getByText("count:0")).toBeInTheDocument())
      fireEvent.click(screen.getByText("add"))
      await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
      expect(client.calls.getProfiles.length).toBeGreaterThanOrEqual(2)
    })
  })
  ```
  `useSessionScrollback.test.tsx`:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { render, waitFor } from "@testing-library/react"
  import { bytesToBase64 } from "@launchkit/pty"
  import type { SessionId } from "@launchkit/types"
  import { IpcClientProvider } from "../IpcClientContext"
  import { createFakeIpcClient } from "../test/fake-client"
  import { useSessionScrollback } from "./useSessionScrollback"

  const Probe = ({ id }: { readonly id: SessionId }): JSX.Element => {
    const { data } = useSessionScrollback(id)
    return <span>{data === undefined ? "no-data" : `len:${data.length}`}</span>
  }

  describe("useSessionScrollback", () => {
    it("fetches and base64-decodes bytesBase64 for replay", async () => {
      const bytes = new Uint8Array([0, 9, 200, 255])
      const client = createFakeIpcClient({
        getSessionScrollback: async () => ({
          ok: true,
          value: { bytesBase64: bytesToBase64(bytes) },
        }),
      })
      const { getByText } = render(
        <IpcClientProvider client={client}>
          <Probe id={"s_1" as SessionId} />
        </IpcClientProvider>,
      )
      await waitFor(() => expect(getByText("len:4")).toBeInTheDocument())
      expect(client.calls.getSessionScrollback[0]).toEqual({ id: "s_1" })
    })
  })
  ```
  Append to `useSessions.test.tsx` (mirror its existing `mock`/`createFakeIpcClient` imports):
  ```tsx
  it("passes a running:true filter through to getSessions", async () => {
    const client = createFakeIpcClient({
      getSessions: async () => ({ ok: true as const, value: [] }),
    })
    const RunningProbe = (): JSX.Element => {
      useSessions({ running: true })
      return <span>ok</span>
    }
    render(
      <IpcClientProvider client={client}>
        <RunningProbe />
      </IpcClientProvider>,
    )
    await waitFor(() => expect(client.calls.getSessions.length).toBeGreaterThan(0))
    expect(client.calls.getSessions[0]).toEqual({ running: true })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/hooks/useProfiles.test.tsx apps/desktop/views/main/hooks/useSessionScrollback.test.tsx apps/desktop/views/main/hooks/useSessions.test.tsx`
  → the two new hooks don't exist; the running-filter test passes already (proving the
  no-change split), but keep it as a regression pin.

- [ ] **Step 3: Implement** —
  `useProfiles.ts`:
  ```ts
  import type { IpcMethods } from "@launchkit/ipc"
  import type { Profile, ProfileId } from "@launchkit/types"
  import { useCallback } from "react"
  import { useIpcClient } from "../IpcClientContext"
  import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

  /** addProfile params = ProfileSchema WITHOUT id (the handler mints it). */
  type AddInput = IpcMethods["addProfile"]["params"]

  export type UseProfiles = AsyncResource<readonly Profile[]> & {
    readonly add: (input: AddInput) => Promise<void>
    readonly update: (profile: Profile) => Promise<void>
    readonly remove: (id: ProfileId) => Promise<void>
  }

  /** Loads profiles and exposes CRUD that calls the client then refetches. */
  export const useProfiles = (): UseProfiles => {
    const client = useIpcClient()
    const call = useCallback(() => client.getProfiles(undefined), [client])
    const resource = useAsyncResource(call)
    const { refetch } = resource

    const add = useCallback(
      async (input: AddInput): Promise<void> => {
        const r = await client.addProfile(input)
        if (r.ok) refetch()
      },
      [client, refetch],
    )
    const update = useCallback(
      async (profile: Profile): Promise<void> => {
        const r = await client.updateProfile(profile)
        if (r.ok) refetch()
      },
      [client, refetch],
    )
    const remove = useCallback(
      async (id: ProfileId): Promise<void> => {
        const r = await client.deleteProfile({ id })
        if (r.ok) refetch()
      },
      [client, refetch],
    )
    return { ...resource, add, update, remove }
  }
  ```
  `useSessionScrollback.ts`:
  ```ts
  import { base64ToBytes } from "@launchkit/pty"
  import type { IpcError } from "@launchkit/ipc"
  import type { SessionId } from "@launchkit/types"
  import { type Result, ok } from "@launchkit/utils"
  import { useCallback } from "react"
  import { useIpcClient } from "../IpcClientContext"
  import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

  /** Fetches a finished session's scrollback and decodes bytesBase64 to bytes for the replay pane. */
  export const useSessionScrollback = (
    id: SessionId,
  ): AsyncResource<Uint8Array> => {
    const client = useIpcClient()
    const call = useCallback(async (): Promise<Result<Uint8Array, IpcError>> => {
      const r = await client.getSessionScrollback({ id })
      return r.ok ? ok(base64ToBytes(r.value.bytesBase64)) : r
    }, [client, id])
    return useAsyncResource(call)
  }
  ```
  Append both to `hooks/index.ts` (`export * from "./useProfiles"` / `"./useSessionScrollback"`).
  `useSessions.ts` needs no change.

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/hooks/`

- [ ] **Step 5: Commit** — `git add apps/desktop/views/main/hooks && git commit -m "feat(desktop): useProfiles + useSessionScrollback hooks; pin sessions running split (D.8)"`

---

### Task D.9: `app.tsx` — `View` model + URL-hash sync (no master/detail yet)

**Files:**
- Modify: `apps/desktop/views/main/app.tsx`
- Test: `apps/desktop/views/main/app.test.tsx` (new)

The `app.tsx` refactor is risky, so split it across D.9/D.11/D.12. **First** replace the flat
`Route` with the `View` discriminated union and bidirectional URL-hash sync — keeping the
EXISTING page rendering temporarily so the app stays green between sub-steps. The `View` type:
```ts
export type View =
  | { readonly kind: "sessions"; readonly selectedSessionId?: SessionId }
  | { readonly kind: "settings"; readonly section: string }
```
Encode to hash: `#sessions` / `#sessions/<id>` / `#settings/<section>`; parse the reverse.
Default = `{ kind: "sessions" }`. `App` takes `initialView` (replacing `initialRoute`).

- [ ] **Step 1: Write the failing test** — new file (render `App` with a fake client + fake
  terminal client + fake `createTerminal`; assert the hash round-trip). xterm never loads
  because `createTerminal` is injected.
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { render, waitFor } from "@testing-library/react"
  import { App } from "./app"
  import { createFakeIpcClient } from "./test/fake-client"
  import type { TerminalClient } from "./terminal/terminalClient"
  import type { XtermInstance } from "./terminal/TerminalPane"

  const fakeTerminalClient: TerminalClient = {
    onData: () => {}, onExit: () => {}, sendInput: () => {}, sendResize: () => {},
    attach: () => {}, kill: () => {}, dispatch: () => {},
  } as unknown as TerminalClient
  const fakeXterm = (): XtermInstance => ({
    open: () => {}, write: () => {}, onData: () => {},
    fit: () => ({ cols: 80, rows: 24 }), cols: 80, rows: 24, dispose: () => {},
  })
  const baseStubs = {
    getSessions: async () => ({ ok: true as const, value: [] }),
    getHarnesses: async () => ({ ok: true as const, value: [] }),
    getProxyStatus: async () => ({ ok: true as const, value: { running: false, port: 4000 } }),
    getProfiles: async () => ({ ok: true as const, value: [] }),
    getAliases: async () => ({ ok: true as const, value: [] }),
  }

  describe("App view model", () => {
    it("defaults to the sessions view and writes #sessions to the hash", async () => {
      window.location.hash = ""
      const client = createFakeIpcClient(baseStubs)
      render(
        <App client={client} terminalClient={fakeTerminalClient} createTerminal={fakeXterm} />,
      )
      await waitFor(() => expect(window.location.hash).toBe("#sessions"))
    })

    it("parses #settings/providers into the settings view on the matching section", async () => {
      const client = createFakeIpcClient(baseStubs)
      render(
        <App
          client={client}
          terminalClient={fakeTerminalClient}
          createTerminal={fakeXterm}
          initialView="settings/providers"
        />,
      )
      await waitFor(() => expect(window.location.hash).toBe("#settings/providers"))
    })

    it("maps the retired #dashboard hash to the sessions view", async () => {
      const client = createFakeIpcClient(baseStubs)
      render(
        <App
          client={client}
          terminalClient={fakeTerminalClient}
          createTerminal={fakeXterm}
          initialView="dashboard"
        />,
      )
      await waitFor(() => expect(window.location.hash).toBe("#sessions"))
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/app.test.tsx`
  → fails: `initialView` prop doesn't exist; hash is still `#dashboard`/`#sessions` from the
  old `Route`.

- [ ] **Step 3: Implement** — in `app.tsx`, add the `View` type + parse/encode helpers, swap
  `useState<Route>` for `useState<View>`, and replace `initialRoute` with `initialView`. Keep
  the existing page rendering TEMPORARILY: map `view.kind === "settings"` to the current
  settings-ish pages (switch on `view.section`) and `"sessions"` to the terminal/sessions page
  (rewritten in D.11). Helpers:
  ```ts
  const parseView = (raw: string): View => {
    const [kind, rest] = raw.replace(/^#/, "").split("/", 2)
    if (kind === "settings") return { kind: "settings", section: rest ?? "general" }
    if (kind === "sessions")
      return rest === undefined || rest === ""
        ? { kind: "sessions" }
        : { kind: "sessions", selectedSessionId: rest as SessionId }
    // Anything else (incl. the retired #dashboard) collapses to the default sessions view.
    return { kind: "sessions" }
  }
  const encodeView = (view: View): string =>
    view.kind === "settings"
      ? `#settings/${view.section}`
      : view.selectedSessionId === undefined
        ? "#sessions"
        : `#sessions/${view.selectedSessionId}`
  ```
  Sync effect: `useEffect(() => { window.location.hash = encodeView(view) }, [view])`. Update
  `mount()` to read `window.location.hash` into `initialView` and pass it through (replacing
  the `startRoute`/`initialRoute` wiring).

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/app.test.tsx`

- [ ] **Step 5: Commit** — `git add apps/desktop/views/main/app.tsx apps/desktop/views/main/app.test.tsx && git commit -m "feat(desktop): View model + URL-hash sync in app.tsx (D.9)"`

---

### Task D.10: Settings sections + `ProfilesPage` + General section (`SettingsView`)

**Files:**
- Create: `apps/desktop/views/main/views/SettingsView.tsx`, `apps/desktop/views/main/pages/ProfilesPage.tsx`, `apps/desktop/views/main/pages/GeneralPage.tsx`
- Modify: `apps/desktop/views/main/pages/index.ts`
- Test: `apps/desktop/views/main/views/SettingsView.test.tsx` (new), `apps/desktop/views/main/pages/ProfilesPage.test.tsx` (new)

`SettingsView(section, onSection)` returns `{ master, detail }` for `AppShell`: master =
`SettingsNav` (sections General | Providers | Routing | Harnesses | Profiles), detail = the
matching page. Relocate the EXISTING `ProvidersPage`/`RoutingPage`/`HarnessesPage` into sections
unchanged (just rendered under `SettingsView`). Add `ProfilesPage` (uses `useProfiles` +
`useHarnesses` + `useAliases`, renders `ProfileList`; add/edit opens `ProfileForm` inside a
`Modal`) and `GeneralPage` (proxy status via `useProxyStatus` + `StatusDot`). In-Settings config
import/export is **deferred to a follow-up** and stays available via the existing tray menu, so
`GeneralPage` ships proxy status only this round (no new IPC methods invented).

- [ ] **Step 1: Write the failing test** —
  `ProfilesPage.test.tsx` (mirror `ProvidersPage.test.tsx`: render under provider, assert list
  renders + add submits). Uses the FINALIZED `ProfileList`/`ProfileForm` props:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { fireEvent, render, screen, waitFor } from "@testing-library/react"
  import type { Profile } from "@launchkit/types"
  import { IpcClientProvider } from "../IpcClientContext"
  import { createFakeIpcClient } from "../test/fake-client"
  import { ProfilesPage } from "./ProfilesPage"

  const profile: Profile = {
    id: "pr_1" as Profile["id"],
    name: "Work",
    harnessId: "claude" as Profile["harnessId"],
    alias: "fast" as Profile["alias"],
    env: {},
  }
  const harness = {
    id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic",
    envTemplate: {}, defaultAlias: "fast", builtIn: true,
  }
  const alias = { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" }
  const baseStubs = {
    getProfiles: async () => ({ ok: true as const, value: [profile] }),
    getHarnesses: async () => ({ ok: true as const, value: [harness] }),
    getAliases: async () => ({ ok: true as const, value: [alias] }),
  }

  describe("ProfilesPage", () => {
    it("lists profiles from getProfiles", async () => {
      const client = createFakeIpcClient(baseStubs)
      render(<IpcClientProvider client={client}><ProfilesPage /></IpcClientProvider>)
      await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument())
    })

    it("opens the ProfileForm in a Modal on add and calls addProfile on submit", async () => {
      const client = createFakeIpcClient({
        ...baseStubs,
        getProfiles: async () => ({ ok: true as const, value: [] }),
        addProfile: async () => ({ ok: true as const, value: profile }),
      })
      render(<IpcClientProvider client={client}><ProfilesPage /></IpcClientProvider>)
      // ProfileList's onAdd opens the modal containing ProfileForm.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /add profile/i })).toBeInTheDocument(),
      )
      fireEvent.click(screen.getByRole("button", { name: /add profile/i }))
      // ProfileForm (Phase 6 / U.10) renders a Name TextInput + a "Save" button.
      await waitFor(() => expect(screen.getByLabelText(/name/i)).toBeInTheDocument())
      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New" } })
      fireEvent.click(screen.getByRole("button", { name: /save|create/i }))
      await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
    })
  })
  ```
  `SettingsView.test.tsx`:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { render, screen } from "@testing-library/react"
  import { IpcClientProvider } from "../IpcClientContext"
  import { createFakeIpcClient } from "../test/fake-client"
  import { SettingsView } from "./SettingsView"

  const stubs = {
    getProviders: async () => ({ ok: true as const, value: [] }),
    getAliases: async () => ({ ok: true as const, value: [] }),
    getHarnesses: async () => ({ ok: true as const, value: [] }),
    getProfiles: async () => ({ ok: true as const, value: [] }),
    getProxyStatus: async () => ({ ok: true as const, value: { running: false, port: 4000 } }),
  }

  describe("SettingsView", () => {
    it("renders SettingsNav as master and the profiles page as detail when section=profiles", () => {
      const client = createFakeIpcClient(stubs)
      const { master, detail } = SettingsView({ section: "profiles", onSection: () => {} })
      render(
        <IpcClientProvider client={client}>
          <div>{master}{detail}</div>
        </IpcClientProvider>,
      )
      // SettingsNav shows the Profiles entry.
      expect(screen.getByText(/profiles/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/views/SettingsView.test.tsx apps/desktop/views/main/pages/ProfilesPage.test.tsx`
  → modules don't exist.

- [ ] **Step 3: Implement** —
  `ProfilesPage.tsx` — owns the hooks; `ProfileList`/`ProfileForm` stay dumb. Maps `Profile`
  (no `aliases` field) onto the finalized props (`ProfileFormValues = { name; harnessId; alias; env }`):
  ```tsx
  import { EmptyState, Modal, ProfileForm, ProfileList, SettingsLayout, Spinner } from "@launchkit/ui"
  import type { ProfileFormValues } from "@launchkit/ui"
  import type { Profile, ProfileId } from "@launchkit/types"
  import { type ReactElement, useState } from "react"
  import { useAliases } from "../hooks/useAliases"
  import { useHarnesses } from "../hooks/useHarnesses"
  import { useProfiles } from "../hooks/useProfiles"

  /** Modal editor state: closed, adding (no id), or editing an existing profile. */
  type Editor =
    | { readonly kind: "closed" }
    | { readonly kind: "add" }
    | { readonly kind: "edit"; readonly profile: Profile }

  export const ProfilesPage = (): ReactElement => {
    const { data, loading, error, add, update, remove } = useProfiles()
    const harnesses = useHarnesses()
    const aliases = useAliases()
    const [editor, setEditor] = useState<Editor>({ kind: "closed" })

    const harnessList = harnesses.data ?? []
    const aliasList = aliases.data ?? []

    const initialValues: ProfileFormValues =
      editor.kind === "edit"
        ? {
            name: editor.profile.name,
            harnessId: editor.profile.harnessId,
            alias: editor.profile.alias,
            env: editor.profile.env,
          }
        : {
            name: "",
            harnessId: (harnessList[0]?.id ?? ("" as Profile["harnessId"])),
            alias: (aliasList[0]?.alias ?? ("" as Profile["alias"])),
            env: {},
          }

    const onSubmit = async (v: ProfileFormValues): Promise<void> => {
      if (editor.kind === "edit") {
        await update({ ...editor.profile, ...v })
      } else {
        await add(v)
      }
      setEditor({ kind: "closed" })
    }

    return (
      <SettingsLayout title="Profiles">
        {loading ? <Spinner label="Loading profiles" /> : null}
        {error !== undefined ? (
          <EmptyState title="Could not load profiles" hint={`IPC error: ${error.kind}`} />
        ) : null}
        {data !== undefined ? (
          <ProfileList
            profiles={data}
            onAdd={() => setEditor({ kind: "add" })}
            onEdit={(p: Profile) => setEditor({ kind: "edit", profile: p })}
            onDelete={(id: ProfileId) => void remove(id)}
          />
        ) : null}
        <Modal
          title={editor.kind === "edit" ? "Edit profile" : "New profile"}
          open={editor.kind !== "closed"}
          onClose={() => setEditor({ kind: "closed" })}
        >
          <ProfileForm
            initialValues={initialValues}
            harnesses={harnessList}
            aliases={aliasList}
            onSubmit={(v) => void onSubmit(v)}
            onCancel={() => setEditor({ kind: "closed" })}
          />
        </Modal>
      </SettingsLayout>
    )
  }
  ```
  `GeneralPage.tsx`: render proxy status only (reuse the `DashboardPage` `useProxyStatus` +
  `StatusDot` block). Config import/export is deferred (still reachable via the tray menu) — do
  not add it here and do not invent IPC for it.
  `SettingsView.tsx`: a `{ section, onSection } → { master, detail }` factory that renders
  `SettingsNav` (finalized props `{ sections, active, onSelect }`) as master and switches the
  detail on `section`, each detail wrapped in `<ErrorBoundary key={section}>`:
  ```tsx
  import type { ReactNode } from "react"
  import { SettingsNav } from "@launchkit/ui"
  import { ErrorBoundary } from "../ErrorBoundary"
  import { GeneralPage, HarnessesPage, ProfilesPage, ProvidersPage, RoutingPage } from "../pages"

  const SECTIONS = [
    { key: "general", label: "General" },
    { key: "providers", label: "Providers" },
    { key: "routing", label: "Routing" },
    { key: "harnesses", label: "Harnesses" },
    { key: "profiles", label: "Profiles" },
  ] as const

  const detailFor = (section: string): ReactNode => {
    switch (section) {
      case "providers": return <ProvidersPage />
      case "routing": return <RoutingPage />
      case "harnesses": return <HarnessesPage />
      case "profiles": return <ProfilesPage />
      default: return <GeneralPage />
    }
  }

  export const SettingsView = ({
    section,
    onSection,
  }: {
    readonly section: string
    readonly onSection: (key: string) => void
  }): { readonly master: ReactNode; readonly detail: ReactNode } => ({
    master: <SettingsNav sections={SECTIONS} active={section} onSelect={onSection} />,
    detail: <ErrorBoundary key={section}>{detailFor(section)}</ErrorBoundary>,
  })
  ```
  Update `pages/index.ts` to export `ProfilesPage` + `GeneralPage` (keep
  Providers/Routing/Harnesses exports; `DashboardPage` stays exported until D.12 retires it).

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/views/ apps/desktop/views/main/pages/`

- [ ] **Step 5: Commit** — `git add apps/desktop/views/main/views apps/desktop/views/main/pages && git commit -m "feat(desktop): SettingsView sections + ProfilesPage + General (D.10)"`

---

### Task D.11: `SessionsView` + master/detail composition through `AppShell`; mounted-but-hidden live panes

**Files:**
- Create: `apps/desktop/views/main/views/SessionsView.tsx`
- Modify: `apps/desktop/views/main/app.tsx`
- Test: `apps/desktop/views/main/views/SessionsView.test.tsx` (new), `apps/desktop/views/main/app.test.tsx`

Now wire the real master/detail. `SessionsView` is a factory returning `{ master, detail }`:
master = `SessionList` (finalized props: `running`/`recent` split from `useSessions`, plus
`labelFor`/`selectedId`/`hasMore`/`onSelect`/`onMore`/`onNew`); detail = the live `TerminalPane`
for an OPEN session, the replay `TerminalPane` (via `useSessionScrollback`) for a selected
finished session, or an empty state when nothing is selected. `app.tsx` renders `AppShell` with
the finalized props (`mode`/`onModeChange`/`proxyRunning`/`master`/`detail`). **Critically**,
keep every OPEN live pane mounted-but-hidden keyed by session id (replacing `TabStrip` + the
tabbed `TerminalPage`) so xterm scrollback survives selection changes — render all open panes in
a hidden host, show only the selected one. A launch sets
`{ kind: "sessions", selectedSessionId: <new> }` and registers the session in the open set.

- [ ] **Step 1: Write the failing test** —
  `SessionsView.test.tsx`:
  ```tsx
  import { describe, expect, it } from "bun:test"
  import { render, screen } from "@testing-library/react"
  import type { Session, SessionId } from "@launchkit/types"
  import { IpcClientProvider } from "../IpcClientContext"
  import { createFakeIpcClient } from "../test/fake-client"
  import { SessionsView } from "./SessionsView"
  import type { TerminalClient } from "../terminal/terminalClient"
  import type { XtermInstance } from "../terminal/TerminalPane"

  const running = {
    id: "s_live", harnessId: "claude", alias: "fast", startedAt: "2026-05-23T10:00:00.000Z",
  } as unknown as Session
  const fakeXterm = (): XtermInstance => ({
    open: () => {}, write: () => {}, onData: () => {},
    fit: () => ({ cols: 80, rows: 24 }), cols: 80, rows: 24, dispose: () => {},
  })
  const fakeTerminalClient = {
    onData: () => {}, onExit: () => {}, sendInput: () => {}, sendResize: () => {},
    attach: () => {}, kill: () => {}, dispatch: () => {},
  } as unknown as TerminalClient

  describe("SessionsView", () => {
    it("renders an empty state in the detail when nothing is selected", () => {
      const client = createFakeIpcClient({ getSessions: async () => ({ ok: true, value: [running] }) })
      const { detail } = SessionsView({
        selectedSessionId: undefined,
        openSessionIds: [],
        onSelect: () => {},
        onNew: () => {},
        terminalClient: fakeTerminalClient,
        createTerminal: fakeXterm,
      })
      render(<IpcClientProvider client={client}><div>{detail}</div></IpcClientProvider>)
      expect(screen.getByText(/no session selected/i)).toBeInTheDocument()
    })

    it("keeps an open live pane mounted (hidden) keyed by session id", () => {
      const client = createFakeIpcClient({ getSessions: async () => ({ ok: true, value: [running] }) })
      const { detail } = SessionsView({
        selectedSessionId: "s_live" as SessionId,
        openSessionIds: ["s_live" as SessionId],
        onSelect: () => {},
        onNew: () => {},
        terminalClient: fakeTerminalClient,
        createTerminal: fakeXterm,
      })
      const { container } = render(
        <IpcClientProvider client={client}><div>{detail}</div></IpcClientProvider>,
      )
      expect(container.querySelector('[data-session="s_live"]')).not.toBeNull()
    })
  })
  ```
  Append to `app.test.tsx`: a regression test that mode toggling works (`onModeChange` →
  `#settings/general`). The launch flow itself is covered in D.12.
  ```tsx
  it("renders the AppShell in sessions mode by default", async () => {
    const client = createFakeIpcClient(baseStubs)
    render(<App client={client} terminalClient={fakeTerminalClient} createTerminal={fakeXterm} />)
    await waitFor(() => expect(window.location.hash).toBe("#sessions"))
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/views/SessionsView.test.tsx apps/desktop/views/main/app.test.tsx`
  → `SessionsView` missing; `app.tsx` still renders the old `TerminalPage`/tabs.

- [ ] **Step 3: Implement** —
  `SessionsView.tsx`: a factory returning `{ master, detail }`.
  - Define the input type:
    ```ts
    export type SessionsViewInput = {
      readonly selectedSessionId?: SessionId
      readonly openSessionIds: readonly SessionId[]
      readonly onSelect: (id: SessionId) => void
      readonly onNew: () => void
      readonly terminalClient: TerminalClient
      readonly createTerminal: CreateTerminal
    }
    ```
  - **Master:** call `useSessions()` inside a small `SessionsMaster` component (so the hook is
    not behind a branch), split into running (`endedAt === undefined`) / recent, and render
    `SessionList`. `labelFor` derives the display fields from each `Session`:
    `labelFor={(s) => ({ harnessName: String(s.harnessId), model: String(s.alias) })}`,
    `hasMore={false}` for now, `selectedId={selectedSessionId}`, `onSelect`, `onMore={() => {}}`,
    `onNew`.
  - **Detail:**
    - Render a hidden host containing one live `TerminalPane mode="live"` per `openSessionIds`,
      each in a wrapper `hidden={id !== selectedSessionId}` (mirrors the old `TerminalPage`
      mounted-hidden pattern, key by id, `data-active`).
    - If `selectedSessionId` is set but NOT in `openSessionIds`, render a `ReplayDetail` child
      component that calls `useSessionScrollback(selectedSessionId)` unconditionally and renders
      `<TerminalPane mode="replay" bytes={sb.data} .../>` when ready, else a `Spinner`.
    - If `selectedSessionId` is undefined, render `<EmptyState title="No session selected" .../>`.
  `app.tsx`: replace `useTerminals`/`TabStrip`/`TerminalPage` usage with an `openSessionIds`
  state set (add on launch, never auto-remove so scrollback persists). Derive `mode` from
  `view.kind`; render `AppShell` with the finalized props, feeding it the `{ master, detail }`
  from `SessionsView` (mode === "sessions") or `SettingsView` (mode === "settings"):
  ```tsx
  const mode: AppMode = view.kind === "settings" ? "settings" : "sessions"
  const proxy = useProxyStatus()
  const onModeChange = (next: AppMode): void =>
    setView(next === "settings" ? { kind: "settings", section: "general" } : { kind: "sessions" })

  const { master, detail } =
    view.kind === "settings"
      ? SettingsView({
          section: view.section,
          onSection: (key) => setView({ kind: "settings", section: key }),
        })
      : SessionsView({
          ...(view.selectedSessionId === undefined
            ? {}
            : { selectedSessionId: view.selectedSessionId }),
          openSessionIds,
          onSelect: (id) => setView({ kind: "sessions", selectedSessionId: id }),
          onNew: () => setModalOpen(true), // modal wired in D.12; a no-op stub is fine here
          terminalClient,
          createTerminal,
        })

  return (
    <IpcClientProvider client={client}>
      <AppShell
        mode={mode}
        onModeChange={onModeChange}
        proxyRunning={proxy.data?.running ?? false}
        master={master}
        detail={detail}
      />
    </IpcClientProvider>
  )
  ```
  The launch handler (used in D.12) sets `view = { kind: "sessions", selectedSessionId: id }` and
  adds `id` to `openSessionIds`. (`onNew` may temporarily be a no-op in D.11 if the modal lands
  in D.12; keep the prop so `SessionList` compiles.)

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/`

- [ ] **Step 5: Commit** — `git add apps/desktop/views/main && git commit -m "feat(desktop): SessionsView + AppShell master/detail with mounted-hidden live panes (D.11)"`

> Add to `apps/desktop/MANUAL-VERIFICATION.md`: "Launch two harnesses, switch between them in
> the session list, confirm each keeps its live output (scrollback survives selection), and
> typing reaches only the selected live session."

---

### Task D.12: retire `DashboardPage`; route quick-launch through the new modal

**Files:**
- Modify: `apps/desktop/views/main/app.tsx`, `apps/desktop/views/main/pages/index.ts`
- Delete: `apps/desktop/views/main/pages/DashboardPage.tsx` + `.test.tsx`; `apps/desktop/views/main/terminal/TerminalPage.tsx` + `.test.tsx`, `TabStrip.tsx` + `.test.tsx`, `useTerminals.ts` (now unused)
- Test: `apps/desktop/views/main/app.test.tsx`

The Dashboard's quick-launch becomes the `NewSessionModal` (launch from the sessions mode);
its proxy-status moves to the rail (`AppShell proxyRunning`) + the General section. Wire
`NewSessionModal` (finalized props + `NewSessionValues`) into `app.tsx`: opening it lets the user
pick a harness/profile (+ optional name/cwd via `pickFolder`), submit maps `NewSessionValues` →
`launchHarness({ id: v.harnessId, alias: v.alias, name: v.name, cwd: v.cwd, env: v.env })`, and if
`v.saveAsProfile` is present ALSO calls
`addProfile({ name: v.saveAsProfile.name, harnessId: v.harnessId, alias: v.alias, env: v.env })`.
On success set the sessions view + open the pane (D.11 handler). Remove `DashboardPage` and the
now-dead tabbed-terminal files. Verify nothing imports the deleted modules.

- [ ] **Step 1: Write the failing test** — append to `app.test.tsx`:
  ```tsx
  it("opens the new-session modal and launches via launchHarness from the sessions header", async () => {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({ ok: true as const, value: [
        { id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic", envTemplate: {}, defaultAlias: "fast", builtIn: true },
      ] }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
      getAliases: async () => ({ ok: true as const, value: [
        { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" },
      ] }),
      launchHarness: async () => ({ ok: true as const, value: { sessionId: "s_new" } }),
    })
    render(<App client={client} terminalClient={fakeTerminalClient} createTerminal={fakeXterm} initialView="sessions" />)
    // Open the modal via SessionList's "+ New session" button (Phase 6 / U.7).
    await waitFor(() => expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /new session/i }))
    // NewSessionModal (Phase 6 / U.11) submit control is the "Launch" button; harness/alias default to the first option.
    await waitFor(() => expect(screen.getByRole("button", { name: /launch/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    expect(client.calls.launchHarness[0]).toMatchObject({ id: "claude" })
    await waitFor(() => expect(window.location.hash).toBe("#sessions/s_new"))
  })

  it("also calls addProfile when 'Save edits as new profile' is checked", async () => {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({ ok: true as const, value: [
        { id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic", envTemplate: {}, defaultAlias: "fast", builtIn: true },
      ] }),
      getAliases: async () => ({ ok: true as const, value: [
        { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" },
      ] }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
      addProfile: async () => ({ ok: true as const, value: {
        id: "pr_1", name: "Work", harnessId: "claude", alias: "fast", env: {},
      } }),
      launchHarness: async () => ({ ok: true as const, value: { sessionId: "s_new" } }),
    })
    render(<App client={client} terminalClient={fakeTerminalClient} createTerminal={fakeXterm} initialView="sessions" />)
    fireEvent.click(await screen.findByRole("button", { name: /new session/i }))
    // Field labels are defined in Phase 6 / U.11: "Name", "Folder", "Save edits as new profile", "Profile name".
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "auth-refactor" } })
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "/tmp/app" } })
    fireEvent.click(screen.getByLabelText(/save edits as new profile/i))
    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "Work" } })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
    expect(client.calls.addProfile[0]).toMatchObject({ name: "Work", harnessId: "claude", alias: "fast" })
  })
  ```

- [ ] **Step 2: Run test, expect RED** — `bun test apps/desktop/views/main/app.test.tsx`
  → no "new session" trigger / modal wired yet.

- [ ] **Step 3: Implement** — in `app.tsx`:
  - Import `NewSessionModal` (+ `NewSessionValues`) from `@launchkit/ui`, plus `useProfiles`,
    `useHarnesses`, `useAliases` to feed the modal's `profiles`/`harnesses`/`aliases`.
  - Add `modalOpen` state and a `folder` state (the picked cwd). `SessionsView`'s `onNew` opens
    the modal.
  - The modal's `onBrowse` → `const r = await client.pickFolder({}); if (r.ok && r.value.path) setFolder(r.value.path)`.
  - `onSubmit` maps `NewSessionValues` → the launch call and the optional profile save:
    ```ts
    const onSubmitNewSession = async (v: NewSessionValues): Promise<void> => {
      const r = await client.launchHarness({
        id: v.harnessId,
        alias: v.alias,
        name: v.name,
        cwd: v.cwd,
        env: v.env,
      })
      if (!r.ok) return
      if (v.saveAsProfile !== undefined) {
        await client.addProfile({
          name: v.saveAsProfile.name,
          harnessId: v.harnessId,
          alias: v.alias,
          env: v.env,
        })
      }
      const id = r.value.sessionId
      setOpenSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setView({ kind: "sessions", selectedSessionId: id })
      setModalOpen(false)
    }
    ```
  - Render `<NewSessionModal open={modalOpen} profiles={profiles.data ?? []} harnesses={harnesses.data ?? []} aliases={aliases.data ?? []} folder={folder} onBrowse={...} onSubmit={(v) => void onSubmitNewSession(v)} onCancel={() => setModalOpen(false)} />`
    alongside the `AppShell` (inside `IpcClientProvider`).
  - Delete `DashboardPage.*`, `TerminalPage.*`, `TabStrip.*`, and `useTerminals.ts`; drop
    `DashboardPage` from `pages/index.ts`. Run `bun run typecheck` to confirm no dangling imports.

- [ ] **Step 4: Run test, expect GREEN** — `bun test apps/desktop/views/main/app.test.tsx`
  then `bun run typecheck` (no references to the deleted modules).

- [ ] **Step 5: Commit** — `git add -A apps/desktop/views/main && git commit -m "feat(desktop): retire DashboardPage + tabbed terminal; launch via NewSessionModal (D.12)"`

> Add to `apps/desktop/MANUAL-VERIFICATION.md`: "Click New session → the native folder picker
> opens for cwd, the modal launches the chosen harness, and the new live terminal appears
> selected. If 'save as profile' is checked, the new profile shows under Settings → Profiles."

---

**Phase gate:** run `bun run typecheck && bun run lint && bun test`, then `bunx electrobun build`
(exit 0) and `apps/desktop/scripts/smoke.sh`.

---

**Cross-phase assumption (single, called out per the brief).** The `@launchkit/ui` phase must
ship the SIX new components with EXACTLY the finalized prop names used above — especially
`AppShell` (`mode`/`onModeChange`/`proxyRunning`/`master`/`detail`, replacing the current
`navItems`/`activeRoute`/`onNavigate` shape), `SessionList`, `SettingsNav`, `NewSessionModal`
(+ `NewSessionValues`), `ProfileList` (`onAdd`/`onEdit`/`onDelete`, NOT `onSelect`), `ProfileForm`
(+ `ProfileFormValues`), and `Modal` — and must export `NewSessionValues`/`ProfileFormValues` as
types. If the ui phase's `ProfileForm` field labels differ from the `/name/i`-style selectors
used in the D.10 RED test, only the test selector strings change (the load-bearing rule — the
page owns the hooks; the components stay dumb — does not). Likewise the `Session` type must carry
optional `name?`/`cwd?` and the terminal manager's launch input must accept them (consumed in D.5).---

## Task FINAL: whole-repo green gate + runtime verification + ledger

**Files:**
- Modify: `apps/desktop/MANUAL-VERIFICATION.md`, `build-plan/PROGRESS.md`

- [ ] **Step 1: Whole-repo gate** — run and confirm all green:

```bash
bun run typecheck && bun run lint && bun test
```
Expected: typecheck clean, lint clean, all tests pass (no skips introduced by this feature).

- [ ] **Step 2: Build the binary** — confirm the Electrobun app still builds:

```bash
bunx electrobun build
```
Expected: exit 0; bundle emitted under `apps/desktop/build/<target>/`.

- [ ] **Step 3: Runtime smoke** — confirm the built app boots and the loopback proxy answers:

```bash
apps/desktop/scripts/smoke.sh
```
Expected: `PASS`.

- [ ] **Step 4: Record eyes-on items** — append to `apps/desktop/MANUAL-VERIFICATION.md` a "Session redesign" checklist (the items automated tests cannot cover):

```markdown
## Session redesign (eyes-on)
- [ ] Rail toggles between Sessions and Settings; proxy dot reflects proxy state.
- [ ] "+ New session" opens the modal; selecting a Profile prefills harness/model/env (still editable).
- [ ] "Browse…" opens the native macOS folder picker; the chosen path fills the Folder field.
- [ ] Starting a session opens its live, interactive terminal in the detail pane; switching sessions preserves each live terminal.
- [ ] An ended session shows a read-only replay terminal of its output + exit banner (including after an app restart).
- [ ] Settings sections work: General (proxy + import/export), Providers, Routing, Harnesses, Profiles CRUD.
- [ ] CLI: `launchkit list profiles`, `add profile …`, `remove profile <id>`, and `launch [<harness>] --profile <id> --name <n> --cwd <path>` all work; the CLI session appears in the GUI list (replay empty, exit banner only).
```

- [ ] **Step 5: Close the ledger** — in `build-plan/PROGRESS.md`, set the feature section's task rows to `done` with their commit SHAs and flip the section status to complete.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/MANUAL-VERIFICATION.md build-plan/PROGRESS.md && git commit -m "docs: session-redesign manual-verification + ledger close (FINAL)"
```

---

## Definition of Done (per task, per CLAUDE.md)

Test-first (RED observed) → implemented (GREEN) → refactored → `bun run typecheck && bun run lint && bun test` green → `PROGRESS.md` row updated with commit SHA → committed with the task ID. If a box can't be checked, the task is not done — mark it `blocked` in `PROGRESS.md` with the reason rather than marking it `done`.
