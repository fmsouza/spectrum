# @launchkit/harnesses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the harness **registry** (built-in `HarnessDefinition`s merged with validated user-defined JSON files) and the generic **launcher** (validate the env template, resolve+validate the command, render env values, spawn the process). Harnesses are fully declarative — there is **no per-harness launch code**; adding a harness is adding a definition.

**Architecture:** Pure logic + injected effects, per `01-conventions/functional-style.md`. The three effects — reading user harness files (`HarnessFileSource`), resolving a command to an absolute path (`CommandResolver`), and spawning a process (`ProcessSpawner`) — are narrow interfaces defined here. Production wires real Bun adapters (`Bun.which`, `Bun.spawn` with **argument arrays**, a directory reader); tests inject in-memory fakes. Every failure is a typed `Result<T, HarnessError>` — nothing throws. Security (`01-conventions/security.md`) is baked into the tasks: spawn with an argument array only, reject relative/`..` commands, restrict env-template tokens to the known three, and render via `renderTemplate`.

**Tech Stack:** TypeScript (strict), zod (via `@launchkit/types` schemas), `bun:test`, Bun runtime APIs (`Bun.which`, `Bun.spawn`).

> Depends on: `types`, `utils` (only). Read `01-conventions/functional-style.md` + `security.md`, and the `HarnessDefinition`/`HarnessDefinitionSchema` shape in `04-plans/01-types.md` and `renderTemplate`/`Result` in `04-plans/02-utils.md`.
> Create the package first via the `launchkit-new-package` skill: `packages/harnesses`, deps `@launchkit/types`, `@launchkit/utils`.

---

### Task harnesses-01: Built-in definitions + `builtinHarnesses` list

**Files:**
- Create: `packages/harnesses/src/builtin/claude.ts`
- Create: `packages/harnesses/src/builtin/codex.ts`
- Create: `packages/harnesses/src/builtin/opencode.ts`
- Create: `packages/harnesses/src/builtin/openclaw.ts`
- Create: `packages/harnesses/src/builtin/index.ts`
- Create: `packages/harnesses/src/tokens.ts`
- Test: `packages/harnesses/src/builtin/index.test.ts`

- [ ] **Step 1: Write the failing test** — every built-in must round-trip through `HarnessDefinitionSchema` and use only the allowed tokens.

```typescript
import { describe, it, expect } from "bun:test"
import { HarnessDefinitionSchema } from "@launchkit/types"
import { builtinHarnesses, claude, codex, opencode, openclaw } from "./index"
import { ALLOWED_TOKENS } from "../tokens"

const tokensIn = (s: string): readonly string[] =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? "")

describe("builtinHarnesses", () => {
  it("lists all four built-ins in a stable order when imported", () => {
    expect(builtinHarnesses.map((h) => h.id)).toEqual(["claude", "codex", "opencode", "openclaw"])
  })

  it("marks every built-in as builtIn:true", () => {
    expect(builtinHarnesses.every((h) => h.builtIn === true)).toBe(true)
  })

  it("parses every built-in through HarnessDefinitionSchema", () => {
    for (const h of builtinHarnesses) {
      expect(HarnessDefinitionSchema.safeParse(h).success).toBe(true)
    }
  })

  it("uses only the allowed tokens in every env template value", () => {
    for (const h of builtinHarnesses) {
      for (const value of Object.values(h.envTemplate)) {
        for (const token of tokensIn(value)) {
          expect(ALLOWED_TOKENS).toContain(token as (typeof ALLOWED_TOKENS)[number])
        }
      }
    }
  })

  it("wires claude to the Anthropic env vars with proxy tokens", () => {
    expect(claude.apiFormat).toBe("anthropic")
    expect(claude.command).toBe("claude")
    expect(claude.envTemplate).toEqual({
      ANTHROPIC_BASE_URL: "{{proxyUrl}}",
      ANTHROPIC_API_KEY: "{{proxyKey}}",
      ANTHROPIC_MODEL: "{{model}}",
    })
  })

  it("wires codex and opencode to the OpenAI env vars", () => {
    expect(codex.apiFormat).toBe("openai")
    expect(opencode.apiFormat).toBe("openai")
    expect(codex.envTemplate).toEqual(opencode.envTemplate)
    expect(codex.envTemplate).toEqual({
      OPENAI_BASE_URL: "{{proxyUrl}}",
      OPENAI_API_KEY: "{{proxyKey}}",
      OPENAI_MODEL: "{{model}}",
    })
  })

  it("wires openclaw to the Anthropic env vars", () => {
    expect(openclaw.apiFormat).toBe("anthropic")
    expect(openclaw.envTemplate).toEqual(claude.envTemplate)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/harnesses` → FAIL (module not found: `./index`, `../tokens`).

- [ ] **Step 3: Implement `tokens.ts`** — the single source of truth for the allowed template tokens.

```typescript
/** The only interpolation tokens a harness env template may use. */
export const ALLOWED_TOKENS = ["proxyUrl", "proxyKey", "model"] as const
export type AllowedToken = (typeof ALLOWED_TOKENS)[number]
```

- [ ] **Step 4: Implement the four built-in definitions.** Each is a `HarnessDefinition` typed via `satisfies` so a contract drift is a compile error. Branded ids/aliases are constructed by parsing through the schemas from `@launchkit/types`.

`builtin/claude.ts`:
```typescript
import { type HarnessDefinition, HarnessIdSchema, AliasNameSchema } from "@launchkit/types"

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
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
} satisfies HarnessDefinition
```

`builtin/codex.ts`:
```typescript
import { type HarnessDefinition, HarnessIdSchema, AliasNameSchema } from "@launchkit/types"

export const codex: HarnessDefinition = {
  id: HarnessIdSchema.parse("codex"),
  name: "Codex",
  command: "codex",
  apiFormat: "openai",
  envTemplate: {
    OPENAI_BASE_URL: "{{proxyUrl}}",
    OPENAI_API_KEY: "{{proxyKey}}",
    OPENAI_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
} satisfies HarnessDefinition
```

`builtin/opencode.ts`:
```typescript
import { type HarnessDefinition, HarnessIdSchema, AliasNameSchema } from "@launchkit/types"

export const opencode: HarnessDefinition = {
  id: HarnessIdSchema.parse("opencode"),
  name: "opencode",
  command: "opencode",
  apiFormat: "openai",
  envTemplate: {
    OPENAI_BASE_URL: "{{proxyUrl}}",
    OPENAI_API_KEY: "{{proxyKey}}",
    OPENAI_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
} satisfies HarnessDefinition
```

`builtin/openclaw.ts`:
```typescript
import { type HarnessDefinition, HarnessIdSchema, AliasNameSchema } from "@launchkit/types"

export const openclaw: HarnessDefinition = {
  id: HarnessIdSchema.parse("openclaw"),
  name: "openclaw",
  command: "openclaw",
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    ANTHROPIC_API_KEY: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
} satisfies HarnessDefinition
```

- [ ] **Step 5: Implement `builtin/index.ts`** — re-export each and assemble the readonly list.

```typescript
import type { HarnessDefinition } from "@launchkit/types"
import { claude } from "./claude"
import { codex } from "./codex"
import { opencode } from "./opencode"
import { openclaw } from "./openclaw"

export { claude } from "./claude"
export { codex } from "./codex"
export { opencode } from "./opencode"
export { openclaw } from "./openclaw"

export const builtinHarnesses: readonly HarnessDefinition[] = [claude, codex, opencode, openclaw]
```

- [ ] **Step 6: Run, expect GREEN.** **Step 7: Commit** `feat(harnesses): add built-in definitions + builtinHarnesses list [harnesses-01]`.

---

### Task harnesses-02: `HarnessError` + `validateEnvTemplate`

**Files:**
- Create: `packages/harnesses/src/errors.ts`
- Create: `packages/harnesses/src/validate-env-template.ts`
- Test: `packages/harnesses/src/validate-env-template.test.ts`

- [ ] **Step 1: Write the failing test** — accepts allowed tokens; rejects an unknown token, naming it.

```typescript
import { describe, it, expect } from "bun:test"
import { validateEnvTemplate } from "./validate-env-template"

describe("validateEnvTemplate", () => {
  it("returns ok when every token is one of the allowed three", () => {
    const r = validateEnvTemplate({
      ANTHROPIC_BASE_URL: "{{proxyUrl}}",
      ANTHROPIC_API_KEY: "{{proxyKey}}",
      ANTHROPIC_MODEL: "{{model}}",
    })
    expect(r).toEqual({ ok: true, value: undefined })
  })

  it("returns ok for a value with no tokens at all", () => {
    expect(validateEnvTemplate({ STATIC: "literal-value" })).toEqual({ ok: true, value: undefined })
  })

  it("returns an invalid-template error naming the first unknown token", () => {
    const r = validateEnvTemplate({ X: "{{proxyUrl}}", Y: "{{secret}}" })
    expect(r).toEqual({ ok: false, error: { kind: "invalid-template", token: "secret" } })
  })

  it("rejects an unknown token even when it appears mid-string", () => {
    expect(validateEnvTemplate({ X: "prefix-{{nope}}-suffix" })).toEqual({
      ok: false,
      error: { kind: "invalid-template", token: "nope" },
    })
  })
})
```

- [ ] **Step 2: Run, expect RED** — module not found.

- [ ] **Step 3: Implement `errors.ts`** — the package-wide error union.

```typescript
/** Every failure mode the harness registry + launcher can produce. */
export type HarnessError =
  | { readonly kind: "invalid-template"; readonly token: string }
  | { readonly kind: "invalid-command"; readonly detail: string }
  | { readonly kind: "duplicate-id"; readonly id: string }
  | { readonly kind: "invalid-definition"; readonly detail: string }
  | { readonly kind: "read-failed"; readonly detail: string }
  | { readonly kind: "spawn-failed"; readonly detail: string }
```

- [ ] **Step 4: Implement `validate-env-template.ts`** — scan every value for `{{token}}` and reject any token not in `ALLOWED_TOKENS`.

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import { ALLOWED_TOKENS, type AllowedToken } from "./tokens"
import type { HarnessError } from "./errors"

const TOKEN = /\{\{(\w+)\}\}/g

const isAllowed = (token: string): token is AllowedToken =>
  (ALLOWED_TOKENS as readonly string[]).includes(token)

/** Rejects any `{{token}}` in any env value that is not one of ALLOWED_TOKENS. */
export const validateEnvTemplate = (
  envTemplate: Readonly<Record<string, string>>,
): Result<void, HarnessError> => {
  for (const value of Object.values(envTemplate)) {
    for (const match of value.matchAll(TOKEN)) {
      const token = match[1] ?? ""
      if (!isAllowed(token)) return err({ kind: "invalid-template", token })
    }
  }
  return ok(undefined)
}
```
> `Result<void, …>`'s success value is `undefined`, so the happy-path assertion is `{ ok: true, value: undefined }`.

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(harnesses): add HarnessError + validateEnvTemplate [harnesses-02]`.

---

### Task harnesses-03: `HarnessFileSource` + fake + `createRegistry`

**Files:**
- Create: `packages/harnesses/src/file-source.ts`
- Create: `packages/harnesses/src/registry.ts`
- Test: `packages/harnesses/src/registry.test.ts`

- [ ] **Step 1: Write the failing test** — the registry merges built-ins with valid user defs, rejects an id colliding with a built-in (`duplicate-id`), rejects malformed defs (`invalid-definition`), and rejects a user def whose env template uses an unknown token (`invalid-template`). It uses the in-memory `HarnessFileSource` fake.

```typescript
import { describe, it, expect } from "bun:test"
import { createRegistry } from "./registry"
import { createInMemoryHarnessFileSource } from "./file-source"
import { builtinHarnesses } from "./builtin/index"

const validUserDef = {
  id: "my-tool",
  name: "My Tool",
  command: "my-tool",
  apiFormat: "openai",
  envTemplate: {
    OPENAI_BASE_URL: "{{proxyUrl}}",
    OPENAI_API_KEY: "{{proxyKey}}",
    OPENAI_MODEL: "{{model}}",
  },
  defaultAlias: "default",
  builtIn: true, // registry must force this to false; a sneaky true is overridden
}

describe("createRegistry", () => {
  it("returns the built-ins alone when there are no user definitions", async () => {
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([]) })
    const r = await registry.list()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.map((h) => h.id)).toEqual(builtinHarnesses.map((h) => h.id))
  })

  it("appends valid user definitions after the built-ins", async () => {
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([validUserDef]) })
    const r = await registry.list()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.map((h) => h.id)).toEqual([...builtinHarnesses.map((h) => h.id), "my-tool"])
    }
  })

  it("forces builtIn:false on every user definition", async () => {
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([validUserDef]) })
    const r = await registry.list()
    expect(r.ok).toBe(true)
    if (r.ok) {
      const mine = r.value.find((h) => h.id === "my-tool")
      expect(mine?.builtIn).toBe(false)
    }
  })

  it("returns a duplicate-id error when a user definition reuses a built-in id", async () => {
    const collide = { ...validUserDef, id: "claude" }
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([collide]) })
    const r = await registry.list()
    expect(r).toEqual({ ok: false, error: { kind: "duplicate-id", id: "claude" } })
  })

  it("returns an invalid-definition error when a user definition fails the schema", async () => {
    const broken = { id: "", name: "", command: "" } // missing required fields, empty id
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([broken]) })
    const r = await registry.list()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-definition")
  })

  it("returns an invalid-template error when a user definition uses an unknown token", async () => {
    const badEnv = { ...validUserDef, id: "leaky", envTemplate: { K: "{{secret}}" } }
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([badEnv]) })
    const r = await registry.list()
    expect(r).toEqual({ ok: false, error: { kind: "invalid-template", token: "secret" } })
  })

  it("propagates a read-failed error from the file source", async () => {
    const failing = createInMemoryHarnessFileSource([], { kind: "read-failed", detail: "EACCES" })
    const registry = createRegistry({ fileSource: failing })
    const r = await registry.list()
    expect(r).toEqual({ ok: false, error: { kind: "read-failed", detail: "EACCES" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — modules not found.

- [ ] **Step 3: Implement `file-source.ts`** — the injected interface plus its in-memory fake.

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { HarnessError } from "./errors"

/**
 * Reads + JSON-parses each `*.json` file in the user harness directory.
 * Returns the raw parsed values (still `unknown`); validation happens in the registry.
 */
export interface HarnessFileSource {
  listDefinitions(): Promise<Result<readonly unknown[], HarnessError>>
}

/** In-memory fake: returns the given defs, or a preset error to exercise read failures. */
export const createInMemoryHarnessFileSource = (
  defs: readonly unknown[],
  failure?: HarnessError,
): HarnessFileSource => ({
  listDefinitions: async (): Promise<Result<readonly unknown[], HarnessError>> =>
    failure === undefined ? ok(defs) : err(failure),
})
```

- [ ] **Step 4: Implement `registry.ts`** — validate each user def with `HarnessDefinitionSchema` (forcing `builtIn:false`), reject collisions with built-in ids, reject schema failures, and validate each env template. Returns built-ins followed by valid user defs.

```typescript
import { type Result, ok, err, isErr } from "@launchkit/utils"
import { type HarnessDefinition, HarnessDefinitionSchema } from "@launchkit/types"
import type { HarnessError } from "./errors"
import type { HarnessFileSource } from "./file-source"
import { builtinHarnesses } from "./builtin/index"
import { validateEnvTemplate } from "./validate-env-template"

export interface HarnessRegistry {
  list(): Promise<Result<readonly HarnessDefinition[], HarnessError>>
}

export const createRegistry = (deps: { readonly fileSource: HarnessFileSource }): HarnessRegistry => ({
  list: async (): Promise<Result<readonly HarnessDefinition[], HarnessError>> => {
    const read = await deps.fileSource.listDefinitions()
    if (isErr(read)) return read

    const builtInIds = new Set(builtinHarnesses.map((h) => h.id))
    const userDefs: HarnessDefinition[] = []

    for (const raw of read.value) {
      // Force builtIn:false so a user file can never masquerade as a built-in.
      const candidate =
        typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>), builtIn: false } : raw

      const parsed = HarnessDefinitionSchema.safeParse(candidate)
      if (!parsed.success) {
        return err({ kind: "invalid-definition", detail: parsed.error.message })
      }
      const def = parsed.data

      if (builtInIds.has(def.id)) {
        return err({ kind: "duplicate-id", id: def.id })
      }

      const env = validateEnvTemplate(def.envTemplate)
      if (isErr(env)) return env

      userDefs.push(def)
    }

    return ok([...builtinHarnesses, ...userDefs])
  },
})
```
> The registry is the only place user JSON becomes a typed `HarnessDefinition`: parse-then-validate, reject-by-default. `builtIn` is overwritten before validation, so the `builtIn:true` in `validUserDef` is dropped to `false`.

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(harnesses): add HarnessFileSource + createRegistry [harnesses-03]`.

---

### Task harnesses-04: `CommandResolver` + `ProcessSpawner` interfaces + fakes

**Files:**
- Create: `packages/harnesses/src/command-resolver.ts`
- Create: `packages/harnesses/src/process-spawner.ts`
- Test: `packages/harnesses/src/command-resolver.test.ts`
- Test: `packages/harnesses/src/process-spawner.test.ts`

- [ ] **Step 1: Write the failing tests.**

`command-resolver.test.ts` — the **fake** resolver enforces the security rules (reject relative paths and any path containing `..`) so launcher tests can rely on it:

```typescript
import { describe, it, expect } from "bun:test"
import { createFakeCommandResolver } from "./command-resolver"

describe("createFakeCommandResolver", () => {
  it("returns the configured absolute path for a bare command on PATH", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    expect(resolver.resolve("claude")).toEqual({ ok: true, value: "/usr/local/bin/claude" })
  })

  it("accepts an already-absolute command and returns it unchanged", () => {
    const resolver = createFakeCommandResolver({})
    expect(resolver.resolve("/opt/tools/codex")).toEqual({ ok: true, value: "/opt/tools/codex" })
  })

  it("rejects a relative command with an invalid-command error", () => {
    const resolver = createFakeCommandResolver({})
    expect(resolver.resolve("./local-bin")).toEqual({
      ok: false,
      error: { kind: "invalid-command", detail: "relative paths are not allowed: ./local-bin" },
    })
  })

  it("rejects any path containing '..' with an invalid-command error", () => {
    const resolver = createFakeCommandResolver({})
    expect(resolver.resolve("/usr/bin/../bin/claude")).toEqual({
      ok: false,
      error: { kind: "invalid-command", detail: "path traversal is not allowed: /usr/bin/../bin/claude" },
    })
  })

  it("rejects a bare command that is not on the fake PATH", () => {
    const resolver = createFakeCommandResolver({})
    const r = resolver.resolve("ghost")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-command")
  })
})
```

`process-spawner.test.ts` — the **recording** fake captures exactly what it was asked to spawn:

```typescript
import { describe, it, expect } from "bun:test"
import { createRecordingProcessSpawner } from "./process-spawner"

describe("createRecordingProcessSpawner", () => {
  it("records the command, args array, and env, and returns the configured pid", () => {
    const spawner = createRecordingProcessSpawner(4321)
    const r = spawner.spawn("/usr/local/bin/claude", [], { ANTHROPIC_API_KEY: "k" })
    expect(r).toEqual({ ok: true, value: { pid: 4321 } })
    expect(spawner.calls).toEqual([
      { command: "/usr/local/bin/claude", args: [], env: { ANTHROPIC_API_KEY: "k" } },
    ])
  })

  it("preserves the args as an array so callers can assert no shell string was used", () => {
    const spawner = createRecordingProcessSpawner(1)
    spawner.spawn("/bin/echo", ["hello", "world"], {})
    expect(Array.isArray(spawner.calls[0]?.args)).toBe(true)
    expect(spawner.calls[0]?.args).toEqual(["hello", "world"])
  })
})
```

- [ ] **Step 2: Run, expect RED** — modules not found.

- [ ] **Step 3: Implement `command-resolver.ts`** — the interface plus a fake whose rejection rules mirror the real adapter (built in harnesses-06).

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { HarnessError } from "./errors"

/** Resolves a command name/path to a validated absolute path, or rejects it. */
export interface CommandResolver {
  resolve(command: string): Result<string, HarnessError>
}

const isAbsolute = (p: string): boolean => p.startsWith("/")
const isRelativePath = (p: string): boolean =>
  p.startsWith("./") || p.startsWith("../") || (p.includes("/") && !isAbsolute(p))

/**
 * Shared guard used by both the fake and the real resolver: reject relative
 * paths and any path containing `..`. Returns the input when it passes.
 */
export const guardCommand = (command: string): Result<string, HarnessError> => {
  if (isRelativePath(command)) {
    return err({ kind: "invalid-command", detail: `relative paths are not allowed: ${command}` })
  }
  if (command.split("/").includes("..")) {
    return err({ kind: "invalid-command", detail: `path traversal is not allowed: ${command}` })
  }
  return ok(command)
}

/**
 * In-memory fake. `pathTable` maps a bare command name to its absolute path.
 * Absolute inputs pass through after the guard; bare names must be in the table.
 */
export const createFakeCommandResolver = (
  pathTable: Readonly<Record<string, string>>,
): CommandResolver => ({
  resolve: (command: string): Result<string, HarnessError> => {
    const guarded = guardCommand(command)
    if (!guarded.ok) return guarded
    if (isAbsolute(command)) return ok(command)
    const found = pathTable[command]
    if (found === undefined) {
      return err({ kind: "invalid-command", detail: `command not found on PATH: ${command}` })
    }
    return ok(found)
  },
})
```
> Order matters: the `..` guard runs before the PATH lookup, so traversal is rejected regardless of the table. `guardCommand` is exported so the real adapter in harnesses-06 reuses the exact same rule.

- [ ] **Step 4: Implement `process-spawner.ts`** — the interface plus a recording fake.

```typescript
import { type Result, ok } from "@launchkit/utils"
import type { HarnessError } from "./errors"

/** Spawns a process from an absolute command + argument ARRAY + env map. Never a shell string. */
export interface ProcessSpawner {
  spawn(
    command: string,
    args: readonly string[],
    env: Readonly<Record<string, string>>,
  ): Result<{ readonly pid: number }, HarnessError>
}

export interface SpawnCall {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

export interface RecordingProcessSpawner extends ProcessSpawner {
  readonly calls: readonly SpawnCall[]
}

/** Records every spawn call (for assertions) and returns the given pid. */
export const createRecordingProcessSpawner = (pid: number): RecordingProcessSpawner => {
  const calls: SpawnCall[] = []
  return {
    calls,
    spawn: (command, args, env): Result<{ readonly pid: number }, HarnessError> => {
      calls.push({ command, args, env })
      return ok({ pid })
    },
  }
}
```

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(harnesses): add CommandResolver + ProcessSpawner interfaces and fakes [harnesses-04]`.

---

### Task harnesses-05: `launchHarness`

**Files:**
- Create: `packages/harnesses/src/launch.ts`
- Test: `packages/harnesses/src/launch.test.ts`

- [ ] **Step 1: Write the failing test** — the launcher validates the env template, resolves+validates the command, renders each env value, then spawns with an **empty args array** and the rendered env. Assert the recording spawner saw an **array** and the **resolved absolute** command; assert a relative command is rejected; assert an unknown env token is rejected (before any spawn).

```typescript
import { describe, it, expect } from "bun:test"
import { AliasNameSchema, type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"
import { launchHarness } from "./launch"
import { createFakeCommandResolver } from "./command-resolver"
import { createRecordingProcessSpawner } from "./process-spawner"

const harness: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    ANTHROPIC_API_KEY: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
}

const params = {
  harness,
  proxyUrl: "http://127.0.0.1:4000",
  proxyKey: "k-secret",
  model: AliasNameSchema.parse("default"),
}

describe("launchHarness", () => {
  it("spawns the resolved absolute command with an empty args array and rendered env", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    const spawner = createRecordingProcessSpawner(999)

    const r = launchHarness({ resolver, spawner })(params)

    expect(r).toEqual({ ok: true, value: { pid: 999 } })
    expect(spawner.calls).toHaveLength(1)
    const call = spawner.calls[0]
    expect(call?.command).toBe("/usr/local/bin/claude")
    expect(Array.isArray(call?.args)).toBe(true)
    expect(call?.args).toEqual([])
    expect(call?.env).toEqual({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
      ANTHROPIC_API_KEY: "k-secret",
      ANTHROPIC_MODEL: "default",
    })
  })

  it("returns an invalid-command error and never spawns when the command is relative", () => {
    const resolver = createFakeCommandResolver({})
    const spawner = createRecordingProcessSpawner(1)
    const relative: HarnessDefinition = { ...harness, command: "./claude" }

    const r = launchHarness({ resolver, spawner })({ ...params, harness: relative })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-command")
    expect(spawner.calls).toEqual([])
  })

  it("returns an invalid-template error and never spawns when an env token is unknown", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    const spawner = createRecordingProcessSpawner(1)
    const leaky: HarnessDefinition = {
      ...harness,
      envTemplate: { ANTHROPIC_API_KEY: "{{secret}}" },
    }

    const r = launchHarness({ resolver, spawner })({ ...params, harness: leaky })

    expect(r).toEqual({ ok: false, error: { kind: "invalid-template", token: "secret" } })
    expect(spawner.calls).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect RED** — module not found.

- [ ] **Step 3: Implement `launch.ts`** — pure orchestration over the two injected effects. Order: validate template → resolve+guard command → render env → spawn with `[]`.

```typescript
import { type Result, ok, err, isErr, renderTemplate } from "@launchkit/utils"
import type { AliasName, HarnessDefinition } from "@launchkit/types"
import type { HarnessError } from "./errors"
import type { CommandResolver } from "./command-resolver"
import type { ProcessSpawner } from "./process-spawner"
import { validateEnvTemplate } from "./validate-env-template"

export interface LaunchParams {
  readonly harness: HarnessDefinition
  readonly proxyUrl: string
  readonly proxyKey: string
  readonly model: AliasName
}

export const launchHarness =
  (deps: { readonly resolver: CommandResolver; readonly spawner: ProcessSpawner }) =>
  (params: LaunchParams): Result<{ readonly pid: number }, HarnessError> => {
    const { harness, proxyUrl, proxyKey, model } = params

    // 1. Restrict env-template tokens to the allowed three.
    const templateCheck = validateEnvTemplate(harness.envTemplate)
    if (isErr(templateCheck)) return templateCheck

    // 2. Resolve + validate the command (rejects relative / `..`).
    const resolved = deps.resolver.resolve(harness.command)
    if (isErr(resolved)) return resolved

    // 3. Render each env value with only the three allowed variables.
    const vars: Readonly<Record<string, string>> = { proxyUrl, proxyKey, model: String(model) }
    const env: Record<string, string> = {}
    for (const [key, template] of Object.entries(harness.envTemplate)) {
      const rendered = renderTemplate(template, vars)
      if (isErr(rendered)) {
        return err({ kind: "invalid-template", token: rendered.error.token })
      }
      env[key] = rendered.value
    }

    // 4. Spawn with an EMPTY argument array — never a shell string.
    return deps.spawner.spawn(resolved.value, [], env)
  }
```
> Token validation runs first, so a leaky template is rejected before the command is resolved or anything spawns. `model` is a branded `AliasName`; `String(model)` yields its underlying string for interpolation. Args are the literal empty array `[]` — the security requirement asserted by the recording fake.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(harnesses): add launchHarness [harnesses-05]`.

---

### Task harnesses-06: Real adapters + integration test

**Files:**
- Create: `packages/harnesses/src/adapters.ts`
- Test: `packages/harnesses/src/adapters.integration.test.ts`

- [ ] **Step 1: Write the failing integration test** — exercise the **real** adapters: resolve a harmless command (`true`/`echo`), spawn it, and confirm a numeric pid; resolve the temp directory file source against a real temp dir; confirm the resolver still rejects relative paths.

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPathCommandResolver, createBunProcessSpawner, createDirHarnessFileSource } from "./adapters"

const tempDirs: string[] = []
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lk-harness-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("createPathCommandResolver (real)", () => {
  it("resolves a real on-PATH command to an absolute path", () => {
    const r = createPathCommandResolver().resolve("true")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.startsWith("/")).toBe(true)
  })

  it("rejects a relative command without touching PATH", () => {
    const r = createPathCommandResolver().resolve("./nope")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-command")
  })
})

describe("createBunProcessSpawner (real)", () => {
  it("spawns a harmless command and returns a numeric pid", () => {
    const resolver = createPathCommandResolver()
    const resolved = resolver.resolve("true")
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return

    const r = createBunProcessSpawner().spawn(resolved.value, [], {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(typeof r.value.pid).toBe("number")
  })
})

describe("createDirHarnessFileSource (real)", () => {
  it("reads and JSON-parses every *.json file in the directory", async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, "a.json"), JSON.stringify({ id: "a" }))
    writeFileSync(join(dir, "b.json"), JSON.stringify({ id: "b" }))
    writeFileSync(join(dir, "ignore.txt"), "not json")

    const r = await createDirHarnessFileSource(dir).listDefinitions()
    expect(r.ok).toBe(true)
    if (r.ok) {
      const ids = r.value.map((d) => (d as { id: string }).id).sort()
      expect(ids).toEqual(["a", "b"])
    }
  })

  it("returns ok with an empty list when the directory does not exist", async () => {
    const r = await createDirHarnessFileSource(join(makeTempDir(), "missing")).listDefinitions()
    expect(r).toEqual({ ok: true, value: [] })
  })

  it("returns a read-failed error when a file contains invalid JSON", async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, "broken.json"), "{ not valid json")
    const r = await createDirHarnessFileSource(dir).listDefinitions()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("read-failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — module not found.

- [ ] **Step 3: Implement `adapters.ts`** — production wiring of the three effects. `createPathCommandResolver` reuses `guardCommand` then `Bun.which`; `createBunProcessSpawner` uses `Bun.spawn` with an **argument array**; `createDirHarnessFileSource` reads + parses each `*.json`.

```typescript
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { type Result, ok, err } from "@launchkit/utils"
import type { HarnessError } from "./errors"
import { type CommandResolver, guardCommand } from "./command-resolver"
import type { ProcessSpawner } from "./process-spawner"
import type { HarnessFileSource } from "./file-source"

/** Real resolver: guard the input, then resolve bare names via `Bun.which`. */
export const createPathCommandResolver = (): CommandResolver => ({
  resolve: (command: string): Result<string, HarnessError> => {
    const guarded = guardCommand(command)
    if (!guarded.ok) return guarded
    if (command.startsWith("/")) return ok(command)
    const found = Bun.which(command)
    if (found === null) {
      return err({ kind: "invalid-command", detail: `command not found on PATH: ${command}` })
    }
    return ok(found)
  },
})

/** Real spawner: `Bun.spawn` with an ARGUMENT ARRAY — never a shell string. */
export const createBunProcessSpawner = (): ProcessSpawner => ({
  spawn: (
    command: string,
    args: readonly string[],
    env: Readonly<Record<string, string>>,
  ): Result<{ readonly pid: number }, HarnessError> => {
    try {
      const child = Bun.spawn([command, ...args], { env, stdio: ["inherit", "inherit", "inherit"] })
      return ok({ pid: child.pid })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "spawn-failed", detail })
    }
  },
})

/** Real file source: read + JSON-parse every `*.json` in `dir`. Missing dir = empty list. */
export const createDirHarnessFileSource = (dir: string): HarnessFileSource => ({
  listDefinitions: async (): Promise<Result<readonly unknown[], HarnessError>> => {
    let entries: readonly string[]
    try {
      entries = await readdir(dir)
    } catch (cause) {
      // A missing directory is not an error — the user simply has no custom harnesses.
      if (typeof cause === "object" && cause !== null && (cause as { code?: string }).code === "ENOENT") {
        return ok([])
      }
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "read-failed", detail })
    }

    const defs: unknown[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      try {
        const text = await Bun.file(join(dir, entry)).text()
        defs.push(JSON.parse(text) as unknown)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        return err({ kind: "read-failed", detail: `${entry}: ${detail}` })
      }
    }
    return ok(defs)
  },
})
```
> Both resolvers share `guardCommand`, so the relative/`..` rejection is identical in production and in the fake. `Bun.spawn` is always called with `[command, ...args]` (an array), satisfying the "argument array only" security rule.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(harnesses): add real Bun adapters + integration test [harnesses-06]`.

---

### Task harnesses-07: Barrel + package CLAUDE.md

**Files:**
- Create: `packages/harnesses/src/index.ts`
- Create: `packages/harnesses/CLAUDE.md`
- Test: `packages/harnesses/src/index.test.ts`

- [ ] **Step 1: Write the failing test** asserting the public surface re-exports the four built-ins, the list, the validators, the registry/launcher factories, the adapters, and the fakes.

```typescript
import { describe, it, expect } from "bun:test"
import * as harnesses from "./index"

describe("@launchkit/harnesses barrel", () => {
  it("exports the four built-ins and the builtinHarnesses list", () => {
    for (const name of ["claude", "codex", "opencode", "openclaw", "builtinHarnesses"]) {
      expect(harnesses).toHaveProperty(name)
    }
  })

  it("exports the validators, registry, and launcher", () => {
    for (const name of ["ALLOWED_TOKENS", "validateEnvTemplate", "createRegistry", "launchHarness"]) {
      expect(harnesses).toHaveProperty(name)
    }
  })

  it("exports the real adapters", () => {
    for (const name of [
      "createPathCommandResolver",
      "createBunProcessSpawner",
      "createDirHarnessFileSource",
    ]) {
      expect(harnesses).toHaveProperty(name)
    }
  })

  it("exports the in-memory fakes for testing downstream packages", () => {
    for (const name of [
      "createInMemoryHarnessFileSource",
      "createFakeCommandResolver",
      "createRecordingProcessSpawner",
    ]) {
      expect(harnesses).toHaveProperty(name)
    }
  })

  it("exposes ALLOWED_TOKENS as the three proxy tokens", () => {
    expect(harnesses.ALLOWED_TOKENS).toEqual(["proxyUrl", "proxyKey", "model"])
  })
})
```

- [ ] **Step 2: Run, expect RED** — `./index` not found.

- [ ] **Step 3: Implement `index.ts`** — the only public surface. `HarnessError`, `HarnessFileSource`, `HarnessRegistry`, `CommandResolver`, `ProcessSpawner`, and `LaunchParams` are type-only exports.

```typescript
export type { HarnessError } from "./errors"
export { ALLOWED_TOKENS, type AllowedToken } from "./tokens"
export { validateEnvTemplate } from "./validate-env-template"

export { claude, codex, opencode, openclaw, builtinHarnesses } from "./builtin/index"

export type { HarnessFileSource } from "./file-source"
export { createInMemoryHarnessFileSource } from "./file-source"

export type { CommandResolver } from "./command-resolver"
export { createFakeCommandResolver } from "./command-resolver"

export type { ProcessSpawner, SpawnCall, RecordingProcessSpawner } from "./process-spawner"
export { createRecordingProcessSpawner } from "./process-spawner"

export type { HarnessRegistry } from "./registry"
export { createRegistry } from "./registry"

export type { LaunchParams } from "./launch"
export { launchHarness } from "./launch"

export {
  createPathCommandResolver,
  createBunProcessSpawner,
  createDirHarnessFileSource,
} from "./adapters"
```
> `guardCommand` is internal — only the resolver implementations use it, so it is deliberately not re-exported.

- [ ] **Step 4: Create `packages/harnesses/CLAUDE.md`** from the `harnesses` entry in `build-plan/03-claude-config/package-claude-md.md`.

- [ ] **Step 5: Run GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(harnesses): add public barrel + CLAUDE.md [harnesses-07]`.

**End state:** `@launchkit/harnesses` exports four declarative built-in `HarnessDefinition`s plus `builtinHarnesses`; a `createRegistry(deps)` that merges built-ins with validated user JSON (rejecting `duplicate-id`, `invalid-definition`, and `invalid-template`, and forcing `builtIn:false`); and a `launchHarness(deps)(params)` launcher that validates the env template, resolves + guards the command, renders env values via `renderTemplate`, and spawns with an **empty argument array** and the rendered env. Effects are injected behind `HarnessFileSource`, `CommandResolver`, and `ProcessSpawner`, with real Bun adapters (`Bun.which`, `Bun.spawn` arg-array, dir reader) and in-memory fakes shipped through the barrel. Security is enforced and tested: argument-array spawning, relative/`..` command rejection, and the three-token env-template allowlist. Downstream `cli`/`desktop` consume it via `import { createRegistry, launchHarness, builtinHarnesses } from "@launchkit/harnesses"`.
