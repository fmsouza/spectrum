# @launchkit/types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the four core domain types — `Provider`, `ModelAlias`, `HarnessDefinition`, `Session` — as zod schemas with inferred TypeScript types and branded ids, so persistence, IPC, and routing all share one validated source of truth.

**Architecture:** Schema-first. Each type is a zod schema; the TS type is `z.infer<...>`. Ids are branded via `z.brand()`. **Secrets are split out of `config`**: a provider's secret fields are keychain references (`SecretRef`), never raw values — this bakes `01-conventions/security.md` into the type system.

**Tech Stack:** TypeScript (strict), zod.

> Depends on: `phase0`. Read `build-plan/01-conventions/typescript.md` + `security.md`. This package depends on nothing internal; only `zod` (external, pinned).
> Create the package first via the `launchkit-new-package` skill: `packages/types`, dep `zod`.

---

### Task types-01: SdkProvider & ApiFormat enums

**Files:**
- Create: `packages/types/src/enums.ts`
- Test: `packages/types/src/enums.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { SdkProviderSchema, ApiFormatSchema } from "./enums"

describe("SdkProviderSchema", () => {
  it("accepts a known provider when given 'anthropic'", () => {
    expect(SdkProviderSchema.parse("anthropic")).toBe("anthropic")
  })
  it("includes every provider from the architecture doc", () => {
    const expected = ["openai","anthropic","google","vertex","bedrock","azure","mistral","cohere","groq","xai","fireworks","perplexity","cerebras","ollama"]
    expect([...SdkProviderSchema.options]).toEqual(expected)
  })
  it("rejects an unknown provider when given 'made-up'", () => {
    expect(SdkProviderSchema.safeParse("made-up").success).toBe(false)
  })
})

describe("ApiFormatSchema", () => {
  it("accepts 'anthropic' and 'openai' and rejects others", () => {
    expect(ApiFormatSchema.safeParse("anthropic").success).toBe(true)
    expect(ApiFormatSchema.safeParse("openai").success).toBe(true)
    expect(ApiFormatSchema.safeParse("grpc").success).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/types` → FAIL (module not found).

- [ ] **Step 3: Implement `enums.ts`**

```typescript
import { z } from "zod"

export const SdkProviderSchema = z.enum([
  "openai", "anthropic", "google", "vertex", "bedrock", "azure",
  "mistral", "cohere", "groq", "xai", "fireworks", "perplexity", "cerebras", "ollama",
])
export type SdkProvider = z.infer<typeof SdkProviderSchema>

export const ApiFormatSchema = z.enum(["anthropic", "openai"])
export type ApiFormat = z.infer<typeof ApiFormatSchema>
```

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(types): add SdkProvider + ApiFormat enums [types-01]`.

---

### Task types-02: Branded ids & SecretRef

**Files:**
- Create: `packages/types/src/ids.ts`
- Test: `packages/types/src/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ProviderIdSchema, AliasNameSchema, HarnessIdSchema, SessionIdSchema, SecretRefSchema } from "./ids"

describe("ProviderIdSchema", () => {
  it("parses a non-empty string into a branded ProviderId", () => {
    expect(ProviderIdSchema.parse("p_123")).toBe("p_123")
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
    expect(SecretRefSchema.safeParse({ ref: "kc_abc", value: "sk-xxx" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `ids.ts`**

```typescript
import { z } from "zod"

export const ProviderIdSchema = z.string().min(1).brand<"ProviderId">()
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const AliasNameSchema = z.string().min(1).brand<"AliasName">()
export type AliasName = z.infer<typeof AliasNameSchema>

export const HarnessIdSchema = z.string().min(1).brand<"HarnessId">()
export type HarnessId = z.infer<typeof HarnessIdSchema>

export const SessionIdSchema = z.string().min(1).brand<"SessionId">()
export type SessionId = z.infer<typeof SessionIdSchema>

/** A reference to a secret stored in the OS keychain — never the raw value. */
export const SecretRefSchema = z.object({ ref: z.string().min(1) }).strict()
export type SecretRef = z.infer<typeof SecretRefSchema>
```
> `.strict()` makes the `value`-field test fail, enforcing "no raw secrets in the type".

- [ ] **Step 4: Run GREEN. Step 5: Commit** `feat(types): add branded ids + SecretRef [types-02]`.

---

### Task types-03: Provider

**Files:**
- Create: `packages/types/src/provider.ts`
- Test: `packages/types/src/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ProviderSchema } from "./provider"

const valid = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secrets: { apiKey: { ref: "kc_openai" } },
  models: ["gpt-4o", "gpt-4o-mini"],
}

describe("ProviderSchema", () => {
  it("parses a valid provider with secret references", () => {
    expect(ProviderSchema.parse(valid)).toEqual(valid)
  })
  it("rejects a provider whose secrets contain a raw value", () => {
    expect(ProviderSchema.safeParse({ ...valid, secrets: { apiKey: { ref: "k", value: "sk" } } }).success).toBe(false)
  })
  it("rejects an unknown sdkProvider", () => {
    expect(ProviderSchema.safeParse({ ...valid, sdkProvider: "nope" }).success).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(ProviderSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run RED.**

- [ ] **Step 3: Implement `provider.ts`**

```typescript
import { z } from "zod"
import { SdkProviderSchema } from "./enums"
import { ProviderIdSchema, SecretRefSchema } from "./ids"

export const ProviderSchema = z.object({
  id: ProviderIdSchema,
  name: z.string().min(1),
  sdkProvider: SdkProviderSchema,
  /** Non-secret provider config: region, baseUrl, project, location, resourceName, deploymentId, … */
  config: z.record(z.string(), z.string()),
  /** Secret fields as keychain references only (apiKey, secretAccessKey, …). */
  secrets: z.record(z.string(), SecretRefSchema),
  /** Known models for the picker UI. */
  models: z.array(z.string()),
}).strict()

export type Provider = z.infer<typeof ProviderSchema>
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(types): add Provider schema [types-03]`.

---

### Task types-04: ModelAlias

**Files:** Create `packages/types/src/alias.ts`; Test `alias.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ModelAliasSchema } from "./alias"

describe("ModelAliasSchema", () => {
  it("parses a valid alias mapping", () => {
    const a = { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" }
    expect(ModelAliasSchema.parse(a)).toEqual(a)
  })
  it("rejects an alias with an empty providerModel", () => {
    expect(ModelAliasSchema.safeParse({ alias: "fast", providerId: "p", providerModel: "" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import { z } from "zod"
import { AliasNameSchema, ProviderIdSchema } from "./ids"

export const ModelAliasSchema = z.object({
  alias: AliasNameSchema,
  providerId: ProviderIdSchema,
  providerModel: z.string().min(1),
}).strict()

export type ModelAlias = z.infer<typeof ModelAliasSchema>
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(types): add ModelAlias schema [types-04]`.

---

### Task types-05: HarnessDefinition

**Files:** Create `packages/types/src/harness.ts`; Test `harness.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { HarnessDefinitionSchema } from "./harness"

const claude = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}", ANTHROPIC_API_KEY: "{{proxyKey}}", ANTHROPIC_MODEL: "{{model}}" },
  defaultAlias: "default",
  builtIn: true,
}

describe("HarnessDefinitionSchema", () => {
  it("parses a valid built-in harness", () => {
    expect(HarnessDefinitionSchema.parse(claude)).toEqual(claude)
  })
  it("parses a harness with an optional description omitted", () => {
    expect(HarnessDefinitionSchema.safeParse(claude).success).toBe(true)
  })
  it("rejects a harness with an invalid apiFormat", () => {
    expect(HarnessDefinitionSchema.safeParse({ ...claude, apiFormat: "soap" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import { z } from "zod"
import { ApiFormatSchema } from "./enums"
import { HarnessIdSchema, AliasNameSchema } from "./ids"

export const HarnessDefinitionSchema = z.object({
  id: HarnessIdSchema,
  name: z.string().min(1),
  command: z.string().min(1),
  apiFormat: ApiFormatSchema,
  envTemplate: z.record(z.string(), z.string()),
  defaultAlias: AliasNameSchema,
  description: z.string().optional(),
  builtIn: z.boolean(),
}).strict()

export type HarnessDefinition = z.infer<typeof HarnessDefinitionSchema>
```
> Template-token validation (only `{{proxyUrl}}`/`{{proxyKey}}`/`{{model}}`) lives in `@launchkit/harnesses`, not here — this schema only types the shape.

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(types): add HarnessDefinition schema [types-05]`.

---

### Task types-06: Session

**Files:** Create `packages/types/src/session.ts`; Test `session.test.ts`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { SessionSchema } from "./session"

const open = { id: "s_1", harnessId: "claude", alias: "default", startedAt: "2026-05-23T10:00:00.000Z" }

describe("SessionSchema", () => {
  it("parses an open session without endedAt/exitCode", () => {
    expect(SessionSchema.parse(open)).toEqual(open)
  })
  it("parses a closed session with endedAt and exitCode", () => {
    const closed = { ...open, endedAt: "2026-05-23T10:05:00.000Z", exitCode: 0 }
    expect(SessionSchema.parse(closed)).toEqual(closed)
  })
  it("rejects a startedAt that is not an ISO datetime", () => {
    expect(SessionSchema.safeParse({ ...open, startedAt: "yesterday" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement**

```typescript
import { z } from "zod"
import { SessionIdSchema, HarnessIdSchema, AliasNameSchema } from "./ids"

export const SessionSchema = z.object({
  id: SessionIdSchema,
  harnessId: HarnessIdSchema,
  alias: AliasNameSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  exitCode: z.number().int().optional(),
}).strict()

export type Session = z.infer<typeof SessionSchema>
```

- [ ] **Step 4: GREEN. Step 5: Commit** `feat(types): add Session schema [types-06]`.

---

### Task types-07: Barrel + package CLAUDE.md

**Files:** Create `packages/types/src/index.ts`, `packages/types/CLAUDE.md`; Test `packages/types/src/index.test.ts`.

- [ ] **Step 1: Failing test** asserting the public surface re-exports everything:

```typescript
import { describe, it, expect } from "bun:test"
import * as types from "./index"

describe("@launchkit/types barrel", () => {
  it("exports every schema and enum when imported", () => {
    for (const name of [
      "SdkProviderSchema","ApiFormatSchema","ProviderIdSchema","AliasNameSchema",
      "HarnessIdSchema","SessionIdSchema","SecretRefSchema","ProviderSchema",
      "ModelAliasSchema","HarnessDefinitionSchema","SessionSchema",
    ]) {
      expect(types).toHaveProperty(name)
    }
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement `index.ts`**

```typescript
export * from "./enums"
export * from "./ids"
export * from "./provider"
export * from "./alias"
export * from "./harness"
export * from "./session"
```

- [ ] **Step 4: Create `packages/types/CLAUDE.md`** from the `types` entry in `build-plan/03-claude-config/package-claude-md.md`.

- [ ] **Step 5: GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(types): add public barrel + CLAUDE.md [types-07]`.

**End state:** `@launchkit/types` exports validated schemas + inferred types for all four domain objects, with secrets modeled as keychain references. Consumers `import { Provider, ProviderSchema, type ProviderId } from "@launchkit/types"`.
