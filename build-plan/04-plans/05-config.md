# @launchkit/config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Own `~/.config/launchkit/config.json` — provide the `Config`/`Settings` schemas + factory defaults, run forward schema migrations, and read/write the file through an injected `ConfigFile` effect with atomic, `0600` writes. Secrets are **never** stored here: a `Provider` already models them as `SecretRef`, and the v1→v2 migration exists precisely to strip the legacy inline-key model out of older files.

**Architecture:** Effects-at-the-edges, per `01-conventions/functional-style.md`. The filesystem is an effect, expressed as the `ConfigFile` interface (`read`/`writeAtomic`/`exists`); a `ConfigStore` is pure orchestration over an injected `ConfigFile` — `load` reads → `JSON.parse` → `runMigrations` (which itself validates with `ConfigSchema`); `save` validates → pretty-prints → `writeAtomic`. Unit tests inject `createInMemoryConfigFile()` (records writes, no disk); a thin `*.integration.test.ts` exercises the real file adapter against a temp dir. Security (`01-conventions/security.md`) is baked in: `proxyHost` is the literal `127.0.0.1` so a non-loopback host fails validation; the real adapter writes `<file>.tmp` → `fsync` → `rename` → `chmod 0600` (documented in the `ConfigFile` doc-comment); every config is zod-validated on load and after migration; a provider carrying an inline raw secret string fails `ConfigSchema`. Performance (`01-conventions/performance.md`) is served by `createCachedConfigStore`, which reads disk once and serves an in-memory cache thereafter (write-through on `save`).

**Tech Stack:** TypeScript (strict), zod, `bun:test`. Depends only on `@launchkit/types` + `@launchkit/utils`.

> Depends on: `types`, `utils` (both `done`). Read `build-plan/01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, `security.md`, and `performance.md`. Imports `Provider` / `ProviderSchema`, `ModelAlias` / `ModelAliasSchema`, and `SecretRef` from `@launchkit/types`; imports `Result`, `ok`, `err`, `isOk`, `isErr`, `andThen`, `map`, and the `Clock` interface from `@launchkit/utils`. These are locked contracts — do not redefine them. No new external deps beyond `zod` (already owned by `types`/`config`).
> Create the package first via the `launchkit-new-package` skill: `packages/config`, deps `@launchkit/types`, `@launchkit/utils`, `zod`.

---

### Task config-01: Settings + Config schemas + defaultConfig

**Files:**
- Create: `packages/config/src/schema.ts`
- Test: `packages/config/src/schema.test.ts`

`CURRENT_CONFIG_VERSION` starts at **2** so config-02 can show a real v1→v2 migration. `proxyHost` is the literal `"127.0.0.1"` — encoding "loopback only" (`security.md`) into the type, so any other host fails validation.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import {
  SettingsSchema,
  ConfigSchema,
  CURRENT_CONFIG_VERSION,
  defaultConfig,
} from "./schema"

const validProvider = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secrets: { apiKey: { ref: "kc_openai" } },
  models: ["gpt-4o", "gpt-4o-mini"],
}

describe("SettingsSchema", () => {
  it("defaults proxyPort to 4000 and proxyHost to loopback when given an empty object", () => {
    expect(SettingsSchema.parse({})).toEqual({ proxyPort: 4000, proxyHost: "127.0.0.1" })
  })
  it("rejects a non-loopback proxyHost so the proxy can never bind a public interface", () => {
    expect(SettingsSchema.safeParse({ proxyHost: "0.0.0.0" }).success).toBe(false)
  })
  it("rejects a non-integer proxyPort", () => {
    expect(SettingsSchema.safeParse({ proxyPort: 40.5 }).success).toBe(false)
  })
})

describe("ConfigSchema", () => {
  it("parses a valid config with one provider, one alias, and settings", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [validProvider],
      aliases: [{ alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" }],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.parse(config)).toEqual(config)
  })
  it("rejects a provider whose secret is an inline raw string instead of a SecretRef", () => {
    const config = {
      version: CURRENT_CONFIG_VERSION,
      providers: [{ ...validProvider, secrets: { apiKey: "sk-raw-inline-key" } }],
      aliases: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(ConfigSchema.safeParse(config).success).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(
      ConfigSchema.safeParse({
        version: CURRENT_CONFIG_VERSION,
        providers: [],
        aliases: [],
        settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

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

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./schema"`).

- [ ] **Step 3: Implement `schema.ts`**

```typescript
import { z } from "zod"
import { ProviderSchema, ModelAliasSchema } from "@launchkit/types"

/** Bump on any breaking config shape change; add a matching `Migration` (see migrations.ts). */
export const CURRENT_CONFIG_VERSION = 2

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

/** The on-disk config document. `providers`/`aliases` reuse the locked `@launchkit/types` schemas. */
export const ConfigSchema = z
  .object({
    version: z.number().int(),
    providers: z.array(ProviderSchema),
    aliases: z.array(ModelAliasSchema),
    settings: SettingsSchema,
  })
  .strict()

export type Config = z.infer<typeof ConfigSchema>

/** Factory defaults for a brand-new install — current version, nothing configured, loopback proxy. */
export const defaultConfig = (): Config => ({
  version: CURRENT_CONFIG_VERSION,
  providers: [],
  aliases: [],
  settings: SettingsSchema.parse({}),
})
```

> `SettingsSchema.parse({})` is the single source of the default settings — `defaultConfig` never hardcodes `4000`/`"127.0.0.1"` twice. Because `ProviderSchema` is `.strict()` with `secrets: z.record(z.string(), SecretRefSchema)`, a provider whose `secrets.apiKey` is a raw `"sk-…"` string (not `{ ref }`) fails `ConfigSchema` — the inline-secret test passes for free, enforcing the security model at the boundary.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(config): add Settings + Config schemas + defaultConfig [config-01]`.

---

### Task config-02: Migration type + migrations array + runMigrations

**Files:**
- Create: `packages/config/src/migrations.ts`
- Test: `packages/config/src/migrations.test.ts`

The one shipped migration is **v1→v2**: v1 stored an `apiKey` string inline on each provider; v2 removes inline keys (they live in the keychain now) and initialises `secrets: {}`. `runMigrations` reads `raw.version`, applies ordered migrations up to `CURRENT_CONFIG_VERSION`, then validates with `ConfigSchema`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { migrations, runMigrations } from "./migrations"
import { CURRENT_CONFIG_VERSION } from "./schema"

// A realistic v1 document: providers carried their key inline, no `secrets` field, no settings.
const v1Config = {
  version: 1,
  providers: [
    {
      id: "p_openai",
      name: "OpenAI",
      sdkProvider: "openai",
      apiKey: "sk-legacy-inline-key",
      config: { baseUrl: "https://api.openai.com/v1" },
      models: ["gpt-4o"],
    },
  ],
  aliases: [{ alias: "fast", providerId: "p_openai", providerModel: "gpt-4o" }],
}

describe("migrations", () => {
  it("ships exactly one ordered v1->v2 migration", () => {
    expect(migrations).toHaveLength(1)
    expect(migrations[0]?.from).toBe(1)
    expect(migrations[0]?.to).toBe(2)
  })
})

describe("runMigrations", () => {
  it("migrates a v1 config to v2 by moving inline keys to secret refs", () => {
    const result = runMigrations(v1Config)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    const provider = result.value.providers[0]
    expect(provider?.secrets).toEqual({})
    // The inline `apiKey` string is gone — it is not part of the validated Provider shape.
    expect((provider as Record<string, unknown>).apiKey).toBeUndefined()
  })

  it("passes an already-current config through and validates it", () => {
    const current = {
      version: CURRENT_CONFIG_VERSION,
      providers: [],
      aliases: [],
      settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
    }
    expect(runMigrations(current)).toEqual({ ok: true, value: current })
  })

  it("returns migration-failed when version is newer than CURRENT", () => {
    const future = { version: CURRENT_CONFIG_VERSION + 1, providers: [], aliases: [], settings: {} }
    const result = runMigrations(future)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("returns migration-failed when version is missing or not a number", () => {
    const result = runMigrations({ providers: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("validates the result after migrating and fails on a shape error", () => {
    // v1 provider with an invalid sdkProvider survives the migration but must fail ConfigSchema.
    const broken = {
      ...v1Config,
      providers: [{ ...v1Config.providers[0], sdkProvider: "not-a-real-provider" }],
    }
    const result = runMigrations(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./migrations"`).

- [ ] **Step 3: Implement `migrations.ts`**

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import { type Config, ConfigSchema, CURRENT_CONFIG_VERSION, SettingsSchema } from "./schema"
import type { ConfigError } from "./errors"

/** A single forward step: take a raw doc at version `from` and return it shaped for version `to`. */
export type Migration = {
  readonly from: number
  readonly to: number
  readonly migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

/**
 * v1 stored each provider's API key inline as `provider.apiKey`. v2 moves secrets to the
 * keychain, so this strips the inline `apiKey` string and initialises `secrets: {}`
 * (the keychain reference is re-established later by `@launchkit/secrets`). It also fills a
 * default `settings` block, which v1 documents did not have.
 */
const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate: (raw) => {
    const providers = Array.isArray(raw.providers) ? raw.providers : []
    const migratedProviders = providers.map((entry) => {
      // Shallow-copy, drop the legacy inline secret, and re-key secrets as an empty ref map.
      const next = { ...asRecord(entry), secrets: {} }
      delete next.apiKey
      return next
    })
    return {
      ...raw,
      version: 2,
      providers: migratedProviders,
      settings: SettingsSchema.parse(asRecord(raw.settings)),
    }
  },
}

/** Ordered list of forward migrations. Append a new step whenever `CURRENT_CONFIG_VERSION` bumps. */
export const migrations: readonly Migration[] = [v1ToV2]

/**
 * Read `raw.version`, apply ordered migrations up to `CURRENT_CONFIG_VERSION`, then validate
 * with `ConfigSchema`. Returns `migration-failed` for an unknown/future version, a missing
 * migration step, or a validation failure after migrating.
 */
export const runMigrations = (raw: unknown): Result<Config, ConfigError> => {
  const doc = asRecord(raw)
  const version = doc.version

  if (typeof version !== "number" || !Number.isInteger(version)) {
    return err({ kind: "migration-failed", detail: "config is missing a numeric version" })
  }
  if (version > CURRENT_CONFIG_VERSION) {
    return err({
      kind: "migration-failed",
      detail: `config version ${version} is newer than supported version ${CURRENT_CONFIG_VERSION}`,
    })
  }

  let current: Record<string, unknown> = doc
  let at = version
  while (at < CURRENT_CONFIG_VERSION) {
    const step = migrations.find((migration) => migration.from === at)
    if (step === undefined) {
      return err({ kind: "migration-failed", detail: `no migration from version ${at}` })
    }
    current = step.migrate(current)
    at = step.to
  }

  const parsed = ConfigSchema.safeParse(current)
  if (!parsed.success) {
    return err({ kind: "migration-failed", detail: parsed.error.message })
  }
  return ok(parsed.data)
}
```

> Building `next` then `delete next.apiKey` is how the inline secret is *removed* — it never reaches the validated `Provider`, which is the whole point of the v1→v2 security change. `runMigrations` validates **after** migrating (security.md: "zod-validate on load and after migration"), so a malformed v1 provider (e.g. bad `sdkProvider`) is rejected as `migration-failed` rather than silently accepted. `ConfigError` is defined in `errors.ts` (next task imports it too); create that file now as shown in Step 4.

- [ ] **Step 4: Create `errors.ts`** (the shared error union, imported by `migrations.ts` and every store):

```typescript
/** Every failure mode for reading, parsing, migrating, or writing the config file. */
export type ConfigError =
  | { readonly kind: "not-found" }
  | { readonly kind: "parse-failed"; readonly detail: string }
  | { readonly kind: "migration-failed"; readonly detail: string }
  | { readonly kind: "write-failed"; readonly detail: string }
```

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(config): add Migration type + migrations + runMigrations [config-02]`.

---

### Task config-03: ConfigFile interface + createInMemoryConfigFile fake

**Files:**
- Create: `packages/config/src/file.ts`
- Test: `packages/config/src/file.test.ts`

`ConfigFile` is the filesystem effect — the only thing a `ConfigStore` knows about disk. The in-memory fake **records every write** (so store tests can assert exact serialized content and prove the atomic "write-then-nothing-partial" contract).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { isOk } from "@launchkit/utils"
import { createInMemoryConfigFile } from "./file"

describe("createInMemoryConfigFile", () => {
  it("reports exists=false and returns not-found from read when created empty", async () => {
    const file = createInMemoryConfigFile()
    expect(await file.exists()).toBe(false)
    expect(await file.read()).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("reports exists=true and reads back the initial contents when seeded", async () => {
    const file = createInMemoryConfigFile('{"hello":"world"}')
    expect(await file.exists()).toBe(true)
    expect(await file.read()).toEqual({ ok: true, value: '{"hello":"world"}' })
  })

  it("records each write and makes the latest contents readable after writeAtomic", async () => {
    const file = createInMemoryConfigFile()
    const written = await file.writeAtomic("first")
    expect(isOk(written)).toBe(true)
    await file.writeAtomic("second")

    expect(file.writes).toEqual(["first", "second"])
    expect(await file.exists()).toBe(true)
    expect(await file.read()).toEqual({ ok: true, value: "second" })
  })

  it("exposes only whole writes — there is never a partially written value", async () => {
    const file = createInMemoryConfigFile()
    await file.writeAtomic("complete-document")
    // Every recorded write is a complete string; the fake mirrors the real adapter's atomic rename.
    for (const recorded of file.writes) {
      expect(recorded).toBe("complete-document")
    }
    expect(await file.read()).toEqual({ ok: true, value: "complete-document" })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./file"`).

- [ ] **Step 3: Implement `file.ts`**

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { ConfigError } from "./errors"

/**
 * The config-file effect — the only thing a `ConfigStore` knows about the filesystem.
 *
 * The real adapter (`createFsConfigFile`, see config-04 integration test) MUST write atomically
 * and with restrictive permissions:
 *   1. write the full contents to a sibling `<file>.tmp`;
 *   2. `fsync` that temp file so the bytes hit disk;
 *   3. `rename` it over `<file>` (an atomic replace — a reader sees either the old or new file,
 *      never a half-written one);
 *   4. `chmod` the file to `0600` (owner read/write only) so secrets-adjacent config is private.
 * The containing directory (`~/.config/launchkit/`) is created `0700` if absent.
 */
export interface ConfigFile {
  read(): Promise<Result<string, ConfigError>>
  writeAtomic(contents: string): Promise<Result<void, ConfigError>>
  exists(): Promise<boolean>
}

/** A `ConfigFile` for unit tests. Records every `writeAtomic` so tests can assert exact content. */
export interface InMemoryConfigFile extends ConfigFile {
  /** Every value passed to `writeAtomic`, in order. */
  readonly writes: readonly string[]
}

/**
 * In-memory fake: no disk, fast, deterministic. `writeAtomic` appends to `writes` and replaces the
 * stored value in one step — mirroring the real adapter's atomic rename, so a reader never observes
 * a partial document.
 */
export const createInMemoryConfigFile = (initial?: string): InMemoryConfigFile => {
  const writes: string[] = []
  let contents: string | undefined = initial
  return {
    get writes(): readonly string[] {
      return writes
    },
    read: async (): Promise<Result<string, ConfigError>> =>
      contents === undefined ? err({ kind: "not-found" }) : ok(contents),
    writeAtomic: async (next: string): Promise<Result<void, ConfigError>> => {
      writes.push(next)
      contents = next
      return ok(undefined)
    },
    exists: async (): Promise<boolean> => contents !== undefined,
  }
}
```

> `writes` is exposed read-only via a getter so tests can assert the exact serialized payload (`config-05`) and that only whole documents are ever written (the atomic contract). The doc-comment on `ConfigFile` is the spec the real `createFsConfigFile` adapter must satisfy (`.tmp` → fsync → rename → `chmod 0600`); that adapter is built and exercised against a temp dir in a `*.integration.test.ts` in config-04.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(config): add ConfigFile interface + in-memory fake [config-03]`.

---

### Task config-04: createFileConfigStore.load (not-found → defaults, parse-failed, migrate + validate)

**Files:**
- Create: `packages/config/src/store.ts`
- Test: `packages/config/src/store.test.ts`
- Test: `packages/config/src/fs-config-file.integration.test.ts`

`load`: if `!exists` → `ok(defaultConfig())`; else `read` → `JSON.parse` (`parse-failed` on throw) → `runMigrations` (which validates). This task also builds the **real** `ConfigFile` adapter and proves the atomic/`0600` contract against a temp dir.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createInMemoryConfigFile } from "./file"
import { createFileConfigStore } from "./store"
import { defaultConfig, CURRENT_CONFIG_VERSION } from "./schema"

describe("createFileConfigStore.load", () => {
  it("returns factory defaults when the file does not exist", async () => {
    const store = createFileConfigStore({ file: createInMemoryConfigFile() })
    const result = await store.load()
    expect(result).toEqual({ ok: true, value: defaultConfig() })
  })

  it("loads, migrates, and validates an existing v1 file into a current Config", async () => {
    const v1OnDisk = JSON.stringify({
      version: 1,
      providers: [
        {
          id: "p_openai",
          name: "OpenAI",
          sdkProvider: "openai",
          apiKey: "sk-legacy",
          config: {},
          models: ["gpt-4o"],
        },
      ],
      aliases: [],
    })
    const store = createFileConfigStore({ file: createInMemoryConfigFile(v1OnDisk) })

    const result = await store.load()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect(result.value.providers[0]?.secrets).toEqual({})
  })

  it("returns parse-failed when the file contains invalid JSON", async () => {
    const store = createFileConfigStore({ file: createInMemoryConfigFile("{ not json") })
    const result = await store.load()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("parse-failed")
  })

  it("returns migration-failed when the parsed JSON has a future version", async () => {
    const onDisk = JSON.stringify({ version: 999, providers: [], aliases: [], settings: {} })
    const store = createFileConfigStore({ file: createInMemoryConfigFile(onDisk) })
    const result = await store.load()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./store"`).

- [ ] **Step 3: Implement `store.ts`** (the `save` half lands in config-05 against the same file)

```typescript
import { type Result, ok, err, isOk } from "@launchkit/utils"
import { type Config, ConfigSchema, defaultConfig } from "./schema"
import { runMigrations } from "./migrations"
import type { ConfigError } from "./errors"
import type { ConfigFile } from "./file"

/** Read/write the whole config document. The read path returns a fully migrated + validated `Config`. */
export interface ConfigStore {
  load(): Promise<Result<Config, ConfigError>>
  save(config: Config): Promise<Result<void, ConfigError>>
}

const parseJson = (raw: string): Result<unknown, ConfigError> => {
  try {
    return ok(JSON.parse(raw) as unknown)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    return err({ kind: "parse-failed", detail })
  }
}

export const createFileConfigStore = (deps: { readonly file: ConfigFile }): ConfigStore => {
  const { file } = deps
  return {
    load: async (): Promise<Result<Config, ConfigError>> => {
      if (!(await file.exists())) return ok(defaultConfig())

      const read = await file.read()
      if (!isOk(read)) return read

      const parsed = parseJson(read.value)
      if (!isOk(parsed)) return parsed

      return runMigrations(parsed.value)
    },
    // `save` is implemented in config-05.
    save: async (config: Config): Promise<Result<void, ConfigError>> => {
      const validated = ConfigSchema.safeParse(config)
      if (!validated.success) {
        return err({ kind: "write-failed", detail: validated.error.message })
      }
      return file.writeAtomic(JSON.stringify(validated.data, null, 2))
    },
  }
}
```

> `load` returns `defaultConfig()` for a fresh install (no file yet), surfaces a thrown `JSON.parse` as a typed `parse-failed` (never a thrown exception — `functional-style.md`), then delegates to `runMigrations`, which migrates **and** zod-validates. A `not-found` from `read` is passed through unchanged (it is already a `ConfigError`). The `save` body is shown here so the file type-checks; its dedicated tests are written in config-05.

- [ ] **Step 4: Write the failing integration test** for the **real** adapter against a temp dir — proving JSON round-trip, the atomic rename, and the `0600` permission bit. Use `Bun`/`node:fs` directly here (this is the one place real IO is exercised).

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isOk } from "@launchkit/utils"
import { createFsConfigFile } from "./fs-config-file"

describe("createFsConfigFile (real filesystem)", () => {
  const dirs: string[] = []
  const freshDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "launchkit-config-"))
    dirs.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
  })

  it("reports exists=false and returns not-found before anything is written", async () => {
    const file = createFsConfigFile(join(await freshDir(), "config.json"))
    expect(await file.exists()).toBe(false)
    expect(await file.read()).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("writes atomically, reads the contents back, and leaves no .tmp file behind", async () => {
    const path = join(await freshDir(), "config.json")
    const file = createFsConfigFile(path)

    const written = await file.writeAtomic('{"version":2}')
    expect(isOk(written)).toBe(true)
    expect(await file.exists()).toBe(true)
    expect(await file.read()).toEqual({ ok: true, value: '{"version":2}' })
    expect(await readFile(path, "utf8")).toBe('{"version":2}')

    // The temp file used during the atomic write must be gone after the rename.
    await expect(stat(`${path}.tmp`)).rejects.toThrow()
  })

  it("sets 0600 permissions on the written file", async () => {
    const path = join(await freshDir(), "config.json")
    await createFsConfigFile(path).writeAtomic("{}")
    const mode = (await stat(path)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it("returns parse-free raw bytes from read so the store owns JSON parsing", async () => {
    const path = join(await freshDir(), "config.json")
    await writeFile(path, "{ not json", "utf8")
    expect(await createFsConfigFile(path).read()).toEqual({ ok: true, value: "{ not json" })
  })
})
```

- [ ] **Step 5: Implement `fs-config-file.ts`** — the production adapter satisfying the `ConfigFile` atomic/`0600` contract.

```typescript
import { dirname } from "node:path"
import { mkdir, readFile, writeFile, rename, chmod, open, access } from "node:fs/promises"
import { type Result, ok, err } from "@launchkit/utils"
import type { ConfigError } from "./errors"
import type { ConfigFile } from "./file"

const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * Production `ConfigFile` backed by `node:fs/promises`. Writes are atomic and `0600`:
 * full contents → `<path>.tmp` → fsync → rename over `<path>` → chmod 0600. The parent dir
 * is created `0700` if missing. `read` returns the raw bytes — JSON parsing belongs to the store.
 */
export const createFsConfigFile = (path: string): ConfigFile => ({
  read: async (): Promise<Result<string, ConfigError>> => {
    try {
      return ok(await readFile(path, "utf8"))
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return err({ kind: "not-found" })
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "parse-failed", detail })
    }
  },

  writeAtomic: async (contents: string): Promise<Result<void, ConfigError>> => {
    const tmp = `${path}.tmp`
    try {
      await mkdir(dirname(path), { recursive: true, mode: DIR_MODE })
      await writeFile(tmp, contents, { mode: FILE_MODE })

      // fsync the temp file so the bytes are durable before the rename swaps it in.
      const handle = await open(tmp, "r+")
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }

      await rename(tmp, path)
      await chmod(path, FILE_MODE)
      return ok(undefined)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "write-failed", detail })
    }
  },

  exists: async (): Promise<boolean> => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  },
})
```

> This is the only place in the package that touches real disk, so it gets its own `*.integration.test.ts`. The unit-level store tests inject `createInMemoryConfigFile` instead and never hit the filesystem. `read` maps `ENOENT` to `not-found` so a fresh install flows into `defaultConfig()`; any other read error is `parse-failed`. The fsync-then-rename sequence is the atomic-write requirement from `security.md`; `chmod 0600` is asserted directly in the integration test.

- [ ] **Step 6: Run, expect GREEN.** **Step 7: Commit** `feat(config): add createFileConfigStore.load + real fs adapter [config-04]`.

---

### Task config-05: createFileConfigStore.save (validate, then writeAtomic with pretty JSON)

**Files:**
- Edit: `packages/config/src/store.ts` (no new code needed — `save` was written in config-04; this task adds its tests and a refactor pass)
- Test: `packages/config/src/store-save.test.ts`

`save`: validate with `ConfigSchema` → `JSON.stringify(_, null, 2)` → `file.writeAtomic`. The fake records the write, so we assert the **exact serialized content**.

- [ ] **Step 1: Write the failing test** — assert the fake recorded exactly one write whose content is the pretty-printed config, and that invalid input is rejected before any write happens.

```typescript
import { describe, it, expect } from "bun:test"
import { createInMemoryConfigFile } from "./file"
import { createFileConfigStore } from "./store"
import { defaultConfig } from "./schema"

describe("createFileConfigStore.save", () => {
  it("writes the config as 2-space pretty JSON exactly once when given a valid config", async () => {
    const file = createInMemoryConfigFile()
    const store = createFileConfigStore({ file })
    const config = defaultConfig()

    const result = await store.save(config)

    expect(result).toEqual({ ok: true, value: undefined })
    expect(file.writes).toHaveLength(1)
    expect(file.writes[0]).toBe(JSON.stringify(config, null, 2))
  })

  it("round-trips through save then load to the same config", async () => {
    const file = createInMemoryConfigFile()
    const store = createFileConfigStore({ file })
    const config = defaultConfig()

    await store.save(config)
    const loaded = await store.load()

    expect(loaded).toEqual({ ok: true, value: config })
  })

  it("returns write-failed and does not write when the config fails validation", async () => {
    const file = createInMemoryConfigFile()
    const store = createFileConfigStore({ file })
    // A non-loopback host is invalid (security.md) — save must reject before touching the file.
    const invalid = { ...defaultConfig(), settings: { proxyPort: 4000, proxyHost: "0.0.0.0" } }

    const result = await store.save(invalid as ReturnType<typeof defaultConfig>)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("write-failed")
    expect(file.writes).toEqual([])
  })

  it("propagates a write-failed error from the file effect when writeAtomic fails", async () => {
    const failing = {
      writes: [] as readonly string[],
      read: async () => ({ ok: false, error: { kind: "not-found" } }) as const,
      writeAtomic: async () =>
        ({ ok: false, error: { kind: "write-failed", detail: "disk full" } }) as const,
      exists: async () => false,
    }
    const store = createFileConfigStore({ file: failing })

    const result = await store.save(defaultConfig())
    expect(result).toEqual({ ok: false, error: { kind: "write-failed", detail: "disk full" } })
  })
})
```

- [ ] **Step 2: Run, expect RED first if `save` is still a stub** — if config-04 already shipped the `save` body shown above, these tests should pass immediately; treat that as the GREEN checkpoint. If any assertion fails (e.g. validation ordering), fix `save` so it validates **before** serializing and writing.

- [ ] **Step 3: Confirm/keep the `save` implementation** in `store.ts` matches:

```typescript
    save: async (config: Config): Promise<Result<void, ConfigError>> => {
      const validated = ConfigSchema.safeParse(config)
      if (!validated.success) {
        return err({ kind: "write-failed", detail: validated.error.message })
      }
      return file.writeAtomic(JSON.stringify(validated.data, null, 2))
    },
```

> The validate-before-write ordering is what makes "does not write when the config fails validation" pass — `file.writes` stays empty because `writeAtomic` is never reached. `save` returns the file effect's `Result` directly, so a `write-failed` from the adapter propagates unchanged (the last test). Serializing `validated.data` (not the raw input) guarantees only schema-clean fields are persisted.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(config): cover createFileConfigStore.save serialization + validation [config-05]`.

---

### Task config-06: createCachedConfigStore (load-once, write-through)

**Files:**
- Create: `packages/config/src/cached-store.ts`
- Test: `packages/config/src/cached-store.test.ts`

PERFORMANCE (`performance.md`: "in-memory config cache is the read path; disk is read once"). The cache is a closure over a mutable cell created by the factory — not a global. `load` reads the inner store once then serves the cache; `save` writes through and updates the cache.

- [ ] **Step 1: Write the failing test** — wrap a counting inner store to prove the second `load` does not hit the inner store, and that `save` updates what later `load`s return.

```typescript
import { describe, it, expect } from "bun:test"
import { type Result, ok } from "@launchkit/utils"
import type { Config } from "./schema"
import { defaultConfig } from "./schema"
import type { ConfigError } from "./errors"
import type { ConfigStore } from "./store"
import { createCachedConfigStore } from "./cached-store"

/** An inner store that counts loads/saves and lets a test mutate the value it would load. */
const countingStore = (
  initial: Config,
): { store: ConfigStore; loads: () => number; saves: () => number; setBacking: (c: Config) => void } => {
  let loadCount = 0
  let saveCount = 0
  let backing = initial
  return {
    loads: () => loadCount,
    saves: () => saveCount,
    setBacking: (c) => {
      backing = c
    },
    store: {
      load: async (): Promise<Result<Config, ConfigError>> => {
        loadCount += 1
        return ok(backing)
      },
      save: async (config: Config): Promise<Result<void, ConfigError>> => {
        saveCount += 1
        backing = config
        return ok(undefined)
      },
    },
  }
}

describe("createCachedConfigStore", () => {
  it("loads from disk once then serves the cached config on later loads", async () => {
    const inner = countingStore(defaultConfig())
    const cached = createCachedConfigStore(inner.store)

    const first = await cached.load()
    const second = await cached.load()

    expect(first).toEqual({ ok: true, value: defaultConfig() })
    expect(second).toEqual(first)
    expect(inner.loads()).toBe(1) // second load was served from cache, not the inner store
  })

  it("does not cache a failed load so a later load retries the inner store", async () => {
    let attempt = 0
    const flaky: ConfigStore = {
      load: async () => {
        attempt += 1
        return attempt === 1
          ? { ok: false, error: { kind: "not-found" } }
          : { ok: true, value: defaultConfig() }
      },
      save: async () => ({ ok: true, value: undefined }),
    }
    const cached = createCachedConfigStore(flaky)

    expect((await cached.load()).ok).toBe(false)
    expect((await cached.load()).ok).toBe(true) // retried because the failure was not cached
    expect(attempt).toBe(2)
  })

  it("write-through: save updates the cache so the next load returns the saved config without hitting disk", async () => {
    const inner = countingStore(defaultConfig())
    const cached = createCachedConfigStore(inner.store)
    await cached.load() // prime the cache (inner load #1)

    const updated: Config = {
      ...defaultConfig(),
      settings: { proxyPort: 5123, proxyHost: "127.0.0.1" },
    }
    const saved = await cached.save(updated)
    expect(saved).toEqual({ ok: true, value: undefined })

    const afterSave = await cached.load()
    expect(afterSave).toEqual({ ok: true, value: updated })
    expect(inner.saves()).toBe(1)
    expect(inner.loads()).toBe(1) // the post-save load was served from the updated cache
  })

  it("does not update the cache when the inner save fails", async () => {
    const inner = countingStore(defaultConfig())
    const failingSave: ConfigStore = {
      load: inner.store.load,
      save: async () => ({ ok: false, error: { kind: "write-failed", detail: "disk full" } }),
    }
    const cached = createCachedConfigStore(failingSave)
    await cached.load() // cache holds defaultConfig()

    const updated: Config = { ...defaultConfig(), settings: { proxyPort: 9999, proxyHost: "127.0.0.1" } }
    const result = await cached.save(updated)

    expect(result.ok).toBe(false)
    // Cache untouched: a later load still returns the original, served from cache.
    expect(await cached.load()).toEqual({ ok: true, value: defaultConfig() })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./cached-store"`).

- [ ] **Step 3: Implement `cached-store.ts`**

```typescript
import { type Result, isOk } from "@launchkit/utils"
import type { Config } from "./schema"
import type { ConfigError } from "./errors"
import type { ConfigStore } from "./store"

/**
 * Wraps a `ConfigStore` with an in-memory cache (performance.md: disk is read once, then the
 * cache is the read path). The cache is a closure-local mutable cell — created per-factory-call,
 * never a module global. A failed `load` is NOT cached (so the next call retries); a failed
 * inner `save` leaves the cache untouched.
 */
export const createCachedConfigStore = (inner: ConfigStore): ConfigStore => {
  let cache: Config | undefined
  return {
    load: async (): Promise<Result<Config, ConfigError>> => {
      if (cache !== undefined) return { ok: true, value: cache }
      const loaded = await inner.load()
      if (isOk(loaded)) cache = loaded.value
      return loaded
    },
    save: async (config: Config): Promise<Result<void, ConfigError>> => {
      const written = await inner.save(config)
      if (isOk(written)) cache = config
      return written
    },
  }
}
```

> The mutable `cache` cell is the one allowed exception in `functional-style.md` ("an explicit, documented memoization cache… created by a factory, not a global"). Caching only on `isOk` is what makes the "does not cache a failed load" and "does not update the cache when the inner save fails" tests pass. Write-through (`save` updates `cache`) means a post-save `load` never re-reads the inner store — the load-count assertions prove the disk read is skipped.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(config): add createCachedConfigStore (load-once + write-through) [config-06]`.

---

### Task config-07: Barrel + package CLAUDE.md

**Files:**
- Create: `packages/config/src/index.ts`
- Create: `packages/config/CLAUDE.md`
- Test: `packages/config/src/index.test.ts`

- [ ] **Step 1: Write the failing test** asserting the public surface re-exports every factory, schema, and default the package promises, and wiring one end-to-end save→load round-trip from the barrel.

```typescript
import { describe, it, expect } from "bun:test"
import * as config from "./index"

describe("@launchkit/config barrel", () => {
  it("exports every public schema, factory, and constant when imported", () => {
    for (const name of [
      "SettingsSchema",
      "ConfigSchema",
      "CURRENT_CONFIG_VERSION",
      "defaultConfig",
      "migrations",
      "runMigrations",
      "createInMemoryConfigFile",
      "createFsConfigFile",
      "createFileConfigStore",
      "createCachedConfigStore",
    ]) {
      expect(config).toHaveProperty(name)
    }
  })

  it("wires a cached file store save/load round-trip through the in-memory fake from the barrel", async () => {
    const file = config.createInMemoryConfigFile()
    const store = config.createCachedConfigStore(config.createFileConfigStore({ file }))

    const next = {
      ...config.defaultConfig(),
      settings: { proxyPort: 4100, proxyHost: "127.0.0.1" as const },
    }
    const saved = await store.save(next)
    expect(saved).toEqual({ ok: true, value: undefined })

    // Disk holds the pretty-printed config; the cache serves the load.
    expect(file.writes[0]).toBe(JSON.stringify(next, null, 2))
    expect(await store.load()).toEqual({ ok: true, value: next })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./index"`).

- [ ] **Step 3: Implement `index.ts`** (named re-exports only — no default export, per `01-conventions/typescript.md`; types via `export type`, per `verbatimModuleSyntax`).

```typescript
export type { Settings, Config } from "./schema"
export { SettingsSchema, ConfigSchema, CURRENT_CONFIG_VERSION, defaultConfig } from "./schema"
export type { Migration } from "./migrations"
export { migrations, runMigrations } from "./migrations"
export type { ConfigError } from "./errors"
export type { ConfigFile, InMemoryConfigFile } from "./file"
export { createInMemoryConfigFile } from "./file"
export { createFsConfigFile } from "./fs-config-file"
export type { ConfigStore } from "./store"
export { createFileConfigStore } from "./store"
export { createCachedConfigStore } from "./cached-store"
```

> `Provider`/`ModelAlias`/`SecretRef` are **not** re-exported here — they are owned by `@launchkit/types`; consumers import them from there. This barrel is the entire public contract; `migrations.ts`/`errors.ts`/etc. internals are reached only through these names.

- [ ] **Step 4: Create `packages/config/CLAUDE.md`** from the `config` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# @launchkit/config

**Responsibility:** Read/write `~/.config/launchkit/config.json` — factory defaults, versioned forward migrations, and atomic, `0600` persistence. Secrets are never stored here (a `Provider` models them as `SecretRef`).

**Public API (barrel `src/index.ts`):** `Config`/`ConfigSchema`, `Settings`/`SettingsSchema`, `CURRENT_CONFIG_VERSION`, `defaultConfig()`; `Migration`/`migrations`/`runMigrations`; `ConfigError`; `ConfigFile`/`createInMemoryConfigFile()` (test fake)/`createFsConfigFile()` (real adapter); `ConfigStore`/`createFileConfigStore({ file })`/`createCachedConfigStore(inner)`.

**Depends on:** `@launchkit/types` (`Provider`, `ModelAlias`, `SecretRef`), `@launchkit/utils` (`Result`, `ok`, `err`, `isOk`, `Clock`) — see build-plan/02-monorepo/boundaries.md.

**Effects owned:** config file (via the injected `ConfigFile` interface) — exposed to consumers as an injected interface; never reached around.

**Local rules:** atomic writes (`<file>.tmp` → fsync → rename), `chmod 0600` on the file / `0700` on the dir, zod-validate on load AND after migration, versioned forward migrations only. Secrets are references only — a provider with an inline raw secret string MUST fail `ConfigSchema`. `proxyHost` is the literal `127.0.0.1` (loopback only). The cached store is the read path; disk is read once.
```

- [ ] **Step 5: Run, expect GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(config): add public barrel + CLAUDE.md [config-07]`.

**End state:** `@launchkit/config` exports a `ConfigStore` (`load`/`save`) over an injected `ConfigFile` effect, an in-memory fake (`createInMemoryConfigFile`, recording writes) for unit tests, and a real atomic adapter (`createFsConfigFile`: `.tmp` → fsync → rename → `chmod 0600`) exercised by a temp-dir `*.integration.test.ts`. `load` returns `defaultConfig()` for a fresh install, surfaces bad JSON as `parse-failed`, and runs `runMigrations` (ordered v1→v2 + zod-validation, `migration-failed` on a future/unknown version or post-migration shape error); the v1→v2 migration strips legacy inline `apiKey` strings and initialises `secrets: {}`, demonstrating the keychain-reference security model. `save` validates with `ConfigSchema` before writing pretty-printed JSON. `createCachedConfigStore` makes the in-memory cache the read path (disk read once, write-through on save), satisfying `performance.md`. Loopback-only is enforced by the `proxyHost: "127.0.0.1"` literal, and secrets are never stored — a provider carrying a raw inline key fails `ConfigSchema`. Consumers `import { createFileConfigStore, createCachedConfigStore, createFsConfigFile, defaultConfig, type Config } from "@launchkit/config"` and inject the fake file in their own tests.
