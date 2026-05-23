# @launchkit/cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the CLI surface — argv parsing plus the `launch`, `list`, `add`, and `remove` commands — implemented as **pure functions over injected subsystem dependencies**. No command touches the filesystem, keychain, network, or process table directly; every effect arrives through an interface (`ConfigStore`, `SecretStore`, the harness registry/launcher, the proxy, `SessionStore`) and every byte of output goes through an injected `Writer`. The whole package is therefore unit-testable with in-memory fakes, no real IO.

**Architecture:** A `runCli(deps)` factory closes over the injected `CliDeps` and returns `(argv) => Promise<Result<void, CliError>>`. It parses argv with the pure `parseArgs`, then dispatches on the command to a per-command function (also pure over `deps`). Commands orchestrate the other packages and report through `deps.out.write`; nothing throws and nothing prints with `console.log`. Errors are a typed `CliError` discriminated union. Security (`01-conventions/security.md`) is baked in: the `launch` path generates the per-run proxy key via the injected `genProxyKey()` and hands it to the harness launcher **only** (which puts it in the child env) — the key is never written through the `Writer`, never logged, and secret *values* are never printed by `add`/`list` (the GUI sets provider secrets via `setProviderSecret`; the CLI's `add provider` creates a provider with empty `secrets`).

**Tech Stack:** TypeScript (strict), `bun:test`. Depends on `@launchkit/types`, `@launchkit/utils`, `@launchkit/config`, `@launchkit/secrets`, `@launchkit/proxy`, `@launchkit/harnesses`, `@launchkit/sessions`. No external runtime deps.

> Depends on: `types`, `utils`, `config`, `secrets`, `proxy`, `harnesses`, `sessions` (all `done`). Read `01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, and `security.md`. Imports these locked contracts — do **not** redefine them: `Provider` / `ProviderSchema` / `ProviderIdSchema`, `ModelAlias` / `ModelAliasSchema`, `HarnessDefinition`, `AliasName` / `AliasNameSchema`, `ProviderId`, `SdkProviderSchema` from `@launchkit/types`; `Result`, `ok`, `err`, `isOk`, `isErr` from `@launchkit/utils`; `ConfigStore` + `Config` from `@launchkit/config`; `SecretStore` from `@launchkit/secrets`; `LaunchParams` + `RunningProxy` (via `startProxy`/`isProxyRunning`) from `@launchkit/proxy` and `@launchkit/harnesses`; `SessionStore` + `SessionInput` from `@launchkit/sessions`.
> Create the package first via the `launchkit-new-package` skill: `packages/cli`, deps `@launchkit/types`, `@launchkit/utils`, `@launchkit/config`, `@launchkit/secrets`, `@launchkit/proxy`, `@launchkit/harnesses`, `@launchkit/sessions`.

---

### Task cli-01: `parseArgs` (pure argv tokenizer)

**Files:**
- Create: `packages/cli/src/parse-args.ts`
- Test: `packages/cli/src/parse-args.test.ts`

`parseArgs` is a pure function: it takes the argv tail (everything after the binary name, i.e. what `process.argv.slice(2)` would yield) and returns the command, the positional rest, and a flag map. It supports `--key value` (string flag) and `--bool` (boolean flag, when the next token is another `--flag` or absent).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { parseArgs } from "./parse-args"

describe("parseArgs", () => {
  it("returns an empty command and no rest when given an empty argv", () => {
    expect(parseArgs([])).toEqual({ command: "", rest: [], flags: {} })
  })

  it("treats the first token as the command and the rest as positionals when no flags are present", () => {
    expect(parseArgs(["launch", "claude"])).toEqual({
      command: "launch",
      rest: ["claude"],
      flags: {},
    })
  })

  it("parses a --key value pair into a string flag when a value follows the key", () => {
    expect(parseArgs(["launch", "claude", "--model", "fast"])).toEqual({
      command: "launch",
      rest: ["claude"],
      flags: { model: "fast" },
    })
  })

  it("parses a bare --flag into a boolean true when the next token is another flag", () => {
    expect(parseArgs(["list", "--json", "--verbose"])).toEqual({
      command: "list",
      rest: [],
      flags: { json: true, verbose: true },
    })
  })

  it("parses a trailing bare --flag into a boolean true when it is the last token", () => {
    expect(parseArgs(["list", "harnesses", "--json"])).toEqual({
      command: "list",
      rest: ["harnesses"],
      flags: { json: true },
    })
  })

  it("collects multiple positionals between and after flags as rest", () => {
    expect(parseArgs(["add", "provider", "--id", "p_x", "extra"])).toEqual({
      command: "add",
      rest: ["provider", "extra"],
      flags: { id: "p_x" },
    })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (`Cannot find module "./parse-args"`).

- [ ] **Step 3: Implement `parse-args.ts`**

```typescript
/** The structured result of tokenizing the argv tail. */
export type ParsedArgs = {
  readonly command: string
  readonly rest: readonly string[]
  readonly flags: Readonly<Record<string, string | boolean>>
}

const isFlag = (token: string): boolean => token.startsWith("--")
const flagName = (token: string): string => token.slice(2)

/**
 * Pure argv tokenizer. The first non-flag token is the `command`; subsequent non-flag
 * tokens are `rest` (positionals). `--key value` yields a string flag; a bare `--flag`
 * (followed by another flag or the end of input) yields a boolean `true`.
 */
export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  let command = ""
  const rest: string[] = []
  const flags: Record<string, string | boolean> = {}

  let i = 0
  while (i < argv.length) {
    const token = argv[i]
    if (token === undefined) {
      i += 1
      continue
    }
    if (isFlag(token)) {
      const next = argv[i + 1]
      if (next !== undefined && !isFlag(next)) {
        flags[flagName(token)] = next
        i += 2
      } else {
        flags[flagName(token)] = true
        i += 1
      }
    } else {
      if (command === "") command = token
      else rest.push(token)
      i += 1
    }
  }

  return { command, rest, flags }
}
```

> `noUncheckedIndexedAccess` means `argv[i]` is `string | undefined`; the `undefined` guard satisfies the compiler without a non-null assertion. The first positional becomes `command`; everything else lands in `rest`, so `parseArgs(["add","provider",...])` exposes the subcommand (`"provider"`) as `rest[0]` for the command handlers in cli-05.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(cli): add pure parseArgs tokenizer [cli-01]`.

---

### Task cli-02: `Writer` + `CliError` + `CliDeps` + `runCli` dispatch

**Files:**
- Create: `packages/cli/src/writer.ts`
- Create: `packages/cli/src/errors.ts`
- Create: `packages/cli/src/deps.ts`
- Create: `packages/cli/src/run.ts`
- Test: `packages/cli/src/writer.test.ts`
- Test: `packages/cli/src/run.test.ts`

This task lands the injected `Writer` (+ a recording fake), the `CliError` union, the `CliDeps` shape (the seam every command receives), and `runCli` with command dispatch — including the `unknown-command` and empty-command paths. The four command bodies are stubbed to a `usage` error so the file type-checks; cli-03/04/05 replace each with a real implementation.

- [ ] **Step 1: Write the failing tests**

`writer.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { createMemoryWriter } from "./writer"

describe("createMemoryWriter", () => {
  it("records each line in order when write() is called", () => {
    const writer = createMemoryWriter()
    writer.write("first")
    writer.write("second")
    expect(writer.lines).toEqual(["first", "second"])
  })

  it("exposes no lines when nothing has been written", () => {
    expect(createMemoryWriter().lines).toEqual([])
  })
})
```

`run.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { createMemoryWriter } from "./writer"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

describe("runCli dispatch", () => {
  it("returns an unknown-command error when the command is not recognized", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out }))(["frobnicate"])
    expect(result).toEqual({ ok: false, error: { kind: "unknown-command", command: "frobnicate" } })
  })

  it("returns a usage error naming the available commands when no command is given", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out }))([])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("dispatches to the list command when the first token is 'list'", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out }))(["list", "harnesses"])
    // list is implemented in cli-03; until then this asserts dispatch reached *a* command,
    // not the unknown-command branch.
    expect(result.ok === false && result.error.kind).not.toBe("unknown-command")
  })
})
```

> The `unknown-command` test deliberately passes `"frobnicate"` and asserts the error carries that exact command string — proving `runCli` echoes the offending token, not a hardcoded value.

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (modules `./writer`, `./run`, `./test-support` not found).

- [ ] **Step 3: Implement `writer.ts`**

```typescript
/** The only thing the CLI knows about output. Production wires stdout; tests record lines. */
export interface Writer {
  write(line: string): void
}

/** A `Writer` for unit tests — records every line so assertions can read `lines`. */
export interface MemoryWriter extends Writer {
  readonly lines: readonly string[]
}

export const createMemoryWriter = (): MemoryWriter => {
  const lines: string[] = []
  return {
    get lines(): readonly string[] {
      return lines
    },
    write: (line: string): void => {
      lines.push(line)
    },
  }
}
```

- [ ] **Step 4: Implement `errors.ts`**

```typescript
/** Every failure mode a CLI invocation can produce. */
export type CliError =
  | { readonly kind: "unknown-command"; readonly command: string }
  | { readonly kind: "usage"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string }
```

- [ ] **Step 5: Implement `deps.ts`** — the injected seam. It re-uses the locked types from each package; it does **not** redefine them. The `launch`, `proxy.start`, and `registry.list` shapes are pinned to exactly what the owning packages export.

```typescript
import type { Config, ConfigStore } from "@launchkit/config"
import type { SecretStore } from "@launchkit/secrets"
import type { SessionStore } from "@launchkit/sessions"
import type { HarnessDefinition } from "@launchkit/types"
import type { LaunchParams } from "@launchkit/harnesses"
import type { RunningProxy } from "@launchkit/proxy"
import type { Result } from "@launchkit/utils"
import type { Writer } from "./writer"

/** Options the CLI passes to `proxy.start` for an ephemeral launch-time proxy. */
export type StartProxyDeps = {
  readonly host: string
  readonly port: number
  readonly proxyKey: string
  readonly config: Config
}

/**
 * Everything a command needs, injected. Each field is an interface owned by another
 * package (or a tiny function seam), so commands stay pure and fully fakeable.
 *
 * - `registry.list()` mirrors `HarnessRegistry.list()` from `@launchkit/harnesses`.
 * - `launch` is `launchHarness(deps)` already partially applied by the app shell — a
 *   single call `(params) => Result<{ pid }, unknown>`.
 * - `proxy.start` returns the `RunningProxy` from `@launchkit/proxy`; `proxy.isRunning`
 *   wraps `isProxyRunning(baseUrl)`.
 * - `genProxyKey` mints the per-run ≥32-byte proxy key (security.md). Its value reaches
 *   the harness env via `launch` only — never the `Writer`.
 */
export type CliDeps = {
  readonly config: ConfigStore
  readonly secrets: SecretStore
  readonly registry: { list(): Promise<Result<readonly HarnessDefinition[], unknown>> }
  readonly launch: (params: LaunchParams) => Result<{ readonly pid: number }, unknown>
  readonly proxy: {
    isRunning(baseUrl: string): Promise<boolean>
    start(opts: StartProxyDeps): RunningProxy
  }
  readonly sessions: SessionStore
  readonly out: Writer
  readonly genProxyKey: () => string
}
```

- [ ] **Step 6: Implement `run.ts`** with dispatch + stubbed command bodies.

```typescript
import { type Result, err } from "@launchkit/utils"
import { parseArgs } from "./parse-args"
import type { CliError } from "./errors"
import type { CliDeps } from "./deps"

const KNOWN_COMMANDS = ["launch", "list", "add", "remove"] as const

const usage = (): Result<void, CliError> =>
  err({ kind: "usage", detail: `expected one of: ${KNOWN_COMMANDS.join(", ")}` })

/**
 * Build the CLI entry point over injected deps. Returns a function that parses argv
 * and dispatches on the command, returning a typed `Result` (never throwing).
 */
export const runCli =
  (deps: CliDeps) =>
  async (argv: readonly string[]): Promise<Result<void, CliError>> => {
    const { command, rest, flags } = parseArgs(argv)

    if (command === "") return usage()

    switch (command) {
      case "launch":
        return runLaunch(deps, rest, flags)
      case "list":
        return runList(deps, rest)
      case "add":
        return runAdd(deps, rest, flags)
      case "remove":
        return runRemove(deps, rest)
      default:
        return err({ kind: "unknown-command", command })
    }
  }

// --- command stubs (replaced in cli-03/04/05) ----------------------------------------
// These return a `usage` Result so dispatch is testable now and nothing throws.

const runLaunch = async (
  _deps: CliDeps,
  _rest: readonly string[],
  _flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => err({ kind: "usage", detail: "launch: not implemented until cli-04" })

const runList = async (
  _deps: CliDeps,
  _rest: readonly string[],
): Promise<Result<void, CliError>> => err({ kind: "usage", detail: "list: not implemented until cli-03" })

const runAdd = async (
  _deps: CliDeps,
  _rest: readonly string[],
  _flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => err({ kind: "usage", detail: "add: not implemented until cli-05" })

const runRemove = async (
  _deps: CliDeps,
  _rest: readonly string[],
): Promise<Result<void, CliError>> => err({ kind: "usage", detail: "remove: not implemented until cli-05" })
```

> The stubs return a `usage` `Result` (not a throw), so the "dispatches to list" test passes (it reached a command, not `unknown-command`) and the package stays exception-free throughout TDD. cli-03/04/05 swap each stub for its real body in this same file. The `default` arm is unreachable for the four known commands but required by `noFallthroughCasesInSwitch` / exhaustiveness — it returns the `unknown-command` error for anything else.

- [ ] **Step 7: Implement `test-support.ts`** — a `makeFakeDeps` helper that assembles a fully in-memory `CliDeps` so every command test wires deps the same way. It uses the real in-memory fakes already shipped by the dependency packages.

```typescript
import { createCachedConfigStore, createFileConfigStore, createInMemoryConfigFile, defaultConfig, type Config } from "@launchkit/config"
import { createInMemoryKeychainBackend, createSecretStore } from "@launchkit/secrets"
import { createInMemoryDatabase, createSessionStore } from "@launchkit/sessions"
import { createSequentialIdGen, createFixedClock, ok, type Result } from "@launchkit/utils"
import type { HarnessDefinition } from "@launchkit/types"
import type { LaunchParams } from "@launchkit/harnesses"
import type { RunningProxy } from "@launchkit/proxy"
import { createMemoryWriter, type MemoryWriter } from "./writer"
import type { CliDeps, StartProxyDeps } from "./deps"

/** A configurable, fully in-memory `CliDeps` for command tests. */
export type FakeDepsOverrides = {
  readonly out?: MemoryWriter
  readonly initialConfig?: Config
  readonly harnesses?: readonly HarnessDefinition[]
  readonly registryError?: unknown
  readonly isProxyRunning?: boolean
  readonly launchResult?: Result<{ readonly pid: number }, unknown>
  readonly launchSpy?: (params: LaunchParams) => void
  readonly proxyStartSpy?: (opts: StartProxyDeps) => void
  readonly proxyKey?: string
}

export const makeFakeDeps = (over: FakeDepsOverrides = {}): CliDeps => {
  const out = over.out ?? createMemoryWriter()

  // A config store seeded with the override (write-through to the in-memory file).
  const file = createInMemoryConfigFile(
    JSON.stringify(over.initialConfig ?? defaultConfig()),
  )
  const config = createCachedConfigStore(createFileConfigStore({ file }))

  const secrets = createSecretStore({
    backend: createInMemoryKeychainBackend(),
    idGen: createSequentialIdGen(),
  })

  const sessions = createSessionStore({
    db: createInMemoryDatabase(),
    clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
    idGen: createSequentialIdGen(),
  })
  sessions.init()

  const runningProxy: RunningProxy = { hostname: "127.0.0.1", port: 4000, stop: () => {} }

  return {
    config,
    secrets,
    sessions,
    out,
    registry: {
      list: async (): Promise<Result<readonly HarnessDefinition[], unknown>> =>
        over.registryError !== undefined
          ? { ok: false, error: over.registryError }
          : ok(over.harnesses ?? []),
    },
    launch: (params: LaunchParams): Result<{ readonly pid: number }, unknown> => {
      over.launchSpy?.(params)
      return over.launchResult ?? ok({ pid: 4321 })
    },
    proxy: {
      isRunning: async (): Promise<boolean> => over.isProxyRunning ?? false,
      start: (opts: StartProxyDeps): RunningProxy => {
        over.proxyStartSpy?.(opts)
        return runningProxy
      },
    },
    genProxyKey: (): string => over.proxyKey ?? "test-proxy-key-0000000000000000000000",
  }
}
```

> `test-support.ts` is a non-`*.test.ts` helper co-located in `src/` (it ships nothing public — it is not re-exported by the barrel). It seeds the config store from an in-memory `ConfigFile` so command tests can assert `config.load()` round-trips after a `save`. The spies let a test observe exactly what `launch`/`proxy.start` were called with, which the cli-04 security assertions rely on.

- [ ] **Step 8: Run, expect GREEN.** **Step 9: Commit** `feat(cli): add Writer, CliError, CliDeps, runCli dispatch [cli-02]`.

---

### Task cli-03: `list harnesses | providers | aliases`

**Files:**
- Edit: `packages/cli/src/run.ts` (replace the `runList` stub)
- Test: `packages/cli/src/list.test.ts`

`list <what>` prints the relevant items: `harnesses` from `registry.list()`, `providers` + `aliases` from the loaded `Config`. A missing/unknown subcommand is a `usage` error. Secret values are never printed (only provider id/name/sdkProvider).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { HarnessIdSchema, AliasNameSchema, type HarnessDefinition } from "@launchkit/types"
import { defaultConfig, type Config } from "@launchkit/config"
import { createMemoryWriter } from "./writer"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const harness: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
}

const configWith = (): Config => ({
  ...defaultConfig(),
  providers: [
    {
      id: "p_openai" as never,
      name: "OpenAI",
      sdkProvider: "openai",
      config: { baseUrl: "https://api.openai.com/v1" },
      secrets: { apiKey: { ref: "kc_openai" } },
      models: ["gpt-4o"],
    },
  ],
  aliases: [{ alias: "fast" as never, providerId: "p_openai" as never, providerModel: "gpt-4o-mini" }],
})

describe("list", () => {
  it("prints each harness id when 'list harnesses' is run", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out, harnesses: [harness] }))(["list", "harnesses"])
    expect(result).toEqual({ ok: true, value: undefined })
    expect(out.lines.join("\n")).toContain("claude")
    expect(out.lines.join("\n")).toContain("Claude Code")
  })

  it("prints each provider id and name when 'list providers' is run", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out, initialConfig: configWith() }))(["list", "providers"])
    expect(result).toEqual({ ok: true, value: undefined })
    const text = out.lines.join("\n")
    expect(text).toContain("p_openai")
    expect(text).toContain("OpenAI")
  })

  it("never prints a secret ref or value when 'list providers' is run", async () => {
    const out = createMemoryWriter()
    await runCli(makeFakeDeps({ out, initialConfig: configWith() }))(["list", "providers"])
    const text = out.lines.join("\n")
    expect(text).not.toContain("kc_openai")
    expect(text).not.toContain("apiKey")
  })

  it("prints each alias mapping when 'list aliases' is run", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out, initialConfig: configWith() }))(["list", "aliases"])
    expect(result).toEqual({ ok: true, value: undefined })
    const text = out.lines.join("\n")
    expect(text).toContain("fast")
    expect(text).toContain("gpt-4o-mini")
  })

  it("returns a usage error when the list subcommand is missing", async () => {
    const result = await runCli(makeFakeDeps())(["list"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a usage error when the list subcommand is unknown", async () => {
    const result = await runCli(makeFakeDeps())(["list", "nonsense"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a failed error when the registry fails to list harnesses", async () => {
    const result = await runCli(makeFakeDeps({ registryError: { kind: "read-failed", detail: "EACCES" } }))([
      "list",
      "harnesses",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })

  it("returns a failed error when the config cannot be loaded for providers", async () => {
    const deps = makeFakeDeps()
    const broken = {
      ...deps,
      config: {
        load: async () => ({ ok: false as const, error: { kind: "parse-failed" as const, detail: "bad json" } }),
        save: deps.config.save,
      },
    }
    const result = await runCli(broken)(["list", "providers"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (the stub returns `usage` for every `list`, so the happy-path assertions fail).

- [ ] **Step 3: Implement** — add a `list.ts` helper module and wire it from `run.ts`.

Create `packages/cli/src/list.ts`:
```typescript
import { type Result, ok, err, isErr } from "@launchkit/utils"
import type { CliError } from "./errors"
import type { CliDeps } from "./deps"

const LIST_TARGETS = ["harnesses", "providers", "aliases"] as const

const listHarnesses = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const listed = await deps.registry.list()
  if (isErr(listed)) return err({ kind: "failed", detail: "could not list harnesses" })
  for (const h of listed.value) {
    deps.out.write(`${h.id}\t${h.name}\t(${h.apiFormat})`)
  }
  return ok(undefined)
}

const listProviders = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded)) return err({ kind: "failed", detail: "could not load config" })
  for (const p of loaded.value.providers) {
    // SECURITY: print only non-secret identity — never `p.secrets` (the keychain refs).
    deps.out.write(`${p.id}\t${p.name}\t[${p.sdkProvider}]`)
  }
  return ok(undefined)
}

const listAliases = async (deps: CliDeps): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded)) return err({ kind: "failed", detail: "could not load config" })
  for (const a of loaded.value.aliases) {
    deps.out.write(`${a.alias}\t-> ${a.providerId} / ${a.providerModel}`)
  }
  return ok(undefined)
}

/** `list harnesses | providers | aliases`. */
export const list = async (deps: CliDeps, rest: readonly string[]): Promise<Result<void, CliError>> => {
  const target = rest[0]
  switch (target) {
    case "harnesses":
      return listHarnesses(deps)
    case "providers":
      return listProviders(deps)
    case "aliases":
      return listAliases(deps)
    default:
      return err({ kind: "usage", detail: `list <${LIST_TARGETS.join("|")}>` })
  }
}
```

Then in `run.ts`, import it and replace the `runList` stub with a one-line delegate:
```typescript
import { list } from "./list"
// ...
const runList = (deps: CliDeps, rest: readonly string[]): Promise<Result<void, CliError>> =>
  list(deps, rest)
```

> Each branch loads only what it needs (registry for harnesses, config for providers/aliases) and maps a failure from the dependency into a `failed` `CliError` so the surfaced error stays message-safe. `listProviders` deliberately formats only `id`/`name`/`sdkProvider` — the secret-leak test fails if `p.secrets` is ever stringified into a line. An unknown/missing target is a `usage` error (not `unknown-command`, since the *command* `list` is valid).

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(cli): add list harnesses|providers|aliases [cli-03]`.

---

### Task cli-04: `launch <harnessId> [--model <alias>]`

**Files:**
- Edit: `packages/cli/src/run.ts` (replace the `runLaunch` stub)
- Create: `packages/cli/src/launch-command.ts`
- Test: `packages/cli/src/launch-command.test.ts`

`launch`: load config; find the harness by id via `registry.list()` (a `usage` error if missing); resolve the alias = `--model` flag if given, else the harness's `defaultAlias`; compute `proxyUrl = http://${settings.proxyHost}:${settings.proxyPort}`; if `await proxy.isRunning(proxyUrl)` is **false**, generate a key via `genProxyKey()` and `proxy.start(...)` (ephemeral) — otherwise reuse the running one; call `launch({ harness, proxyUrl, proxyKey, model: alias })`; on success record a session via `sessions.create({ harnessId, alias })` and print the pid + session id. The key is passed to `launch` only and is never written through the `Writer`.

- [ ] **Step 1: Write the failing test** — these are the KEY tests for the package's security + orchestration contract.

```typescript
import { describe, it, expect } from "bun:test"
import { HarnessIdSchema, AliasNameSchema, type HarnessDefinition } from "@launchkit/types"
import type { LaunchParams } from "@launchkit/harnesses"
import type { StartProxyDeps } from "./deps"
import { createMemoryWriter } from "./writer"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const claude: HarnessDefinition = {
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

describe("launch", () => {
  it("returns a usage error when no harness id is given", async () => {
    const result = await runCli(makeFakeDeps({ harnesses: [claude] }))(["launch"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a usage error when the harness id is not in the registry", async () => {
    const result = await runCli(makeFakeDeps({ harnesses: [claude] }))(["launch", "ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("reuses the running proxy when one is already up", async () => {
    let started = false
    const result = await runCli(
      makeFakeDeps({
        harnesses: [claude],
        isProxyRunning: true,
        proxyStartSpy: () => {
          started = true
        },
      }),
    )(["launch", "claude"])
    expect(result).toEqual({ ok: true, value: undefined })
    expect(started).toBe(false) // proxy.start MUST NOT be called when one is already running
  })

  it("starts an ephemeral proxy when none is running", async () => {
    const startCalls: StartProxyDeps[] = []
    const result = await runCli(
      makeFakeDeps({
        harnesses: [claude],
        isProxyRunning: false,
        proxyStartSpy: (opts) => {
          startCalls.push(opts)
        },
      }),
    )(["launch", "claude"])
    expect(result).toEqual({ ok: true, value: undefined })
    expect(startCalls).toHaveLength(1)
    expect(startCalls[0]?.host).toBe("127.0.0.1")
    expect(startCalls[0]?.port).toBe(4000)
  })

  it("launches the harness with the resolved alias and records a session", async () => {
    const launchCalls: LaunchParams[] = []
    const out = createMemoryWriter()
    const deps = makeFakeDeps({
      out,
      harnesses: [claude],
      launchSpy: (params) => {
        launchCalls.push(params)
      },
      launchResult: { ok: true, value: { pid: 4321 } },
    })

    const result = await runCli(deps)(["launch", "claude", "--model", "fast"])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(launchCalls).toHaveLength(1)
    expect(launchCalls[0]?.harness.id).toBe("claude")
    expect(String(launchCalls[0]?.model)).toBe("fast")
    expect(launchCalls[0]?.proxyUrl).toBe("http://127.0.0.1:4000")

    // The pid and a session id are reported.
    const text = out.lines.join("\n")
    expect(text).toContain("4321")
    expect(text).toContain("s_1")

    // A session row was persisted.
    const sessionsList = deps.sessions.query()
    expect(sessionsList.ok && sessionsList.value).toHaveLength(1)
    expect(sessionsList.ok && sessionsList.value[0]?.harnessId).toBe("claude")
    expect(sessionsList.ok && String(sessionsList.value[0]?.alias)).toBe("fast")
  })

  it("falls back to the harness defaultAlias when no --model flag is given", async () => {
    const launchCalls: LaunchParams[] = []
    await runCli(
      makeFakeDeps({ harnesses: [claude], launchSpy: (p) => launchCalls.push(p) }),
    )(["launch", "claude"])
    expect(String(launchCalls[0]?.model)).toBe("default")
  })

  it("passes the generated proxy key to launch but never writes it to the output", async () => {
    const launchCalls: LaunchParams[] = []
    const out = createMemoryWriter()
    const SECRET_KEY = "super-secret-proxy-key-deadbeef-deadbeef-32b"
    await runCli(
      makeFakeDeps({
        out,
        harnesses: [claude],
        isProxyRunning: false,
        proxyKey: SECRET_KEY,
        launchSpy: (p) => launchCalls.push(p),
      }),
    )(["launch", "claude"])

    // The key reaches the launcher (which puts it in the child env) ...
    expect(launchCalls[0]?.proxyKey).toBe(SECRET_KEY)
    // ... but is NEVER printed.
    expect(out.lines.join("\n")).not.toContain(SECRET_KEY)
  })

  it("returns a failed error when the launcher fails to spawn", async () => {
    const result = await runCli(
      makeFakeDeps({
        harnesses: [claude],
        launchResult: { ok: false, error: { kind: "spawn-failed", detail: "ENOENT" } },
      }),
    )(["launch", "claude"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })

  it("returns a failed error when the registry cannot be listed", async () => {
    const result = await runCli(
      makeFakeDeps({ registryError: { kind: "read-failed", detail: "EACCES" } }),
    )(["launch", "claude"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (the stub returns `usage`, so every happy-path + proxy/session assertion fails).

- [ ] **Step 3: Implement `launch-command.ts`**

```typescript
import { type Result, ok, err, isErr } from "@launchkit/utils"
import { AliasNameSchema, type AliasName, type HarnessDefinition } from "@launchkit/types"
import type { CliError } from "./errors"
import type { CliDeps } from "./deps"

/** Resolve the alias: the `--model` flag if a string, else the harness's defaultAlias. */
const resolveAlias = (
  harness: HarnessDefinition,
  flags: Readonly<Record<string, string | boolean>>,
): AliasName => {
  const flag = flags["model"]
  return typeof flag === "string" ? AliasNameSchema.parse(flag) : harness.defaultAlias
}

/**
 * `launch <harnessId> [--model <alias>]`.
 *
 * Loads config, finds the harness, resolves the alias, ensures a proxy is up (reusing a
 * running one, else starting an ephemeral one with a freshly generated per-run key), then
 * launches the harness and records a session. SECURITY: the generated proxy key flows only
 * into `deps.launch(...)` (which the harness launcher places in the child env) — it is
 * never passed to `deps.out.write`.
 */
export const launchCommand = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const harnessId = rest[0]
  if (harnessId === undefined) {
    return err({ kind: "usage", detail: "launch <harnessId> [--model <alias>]" })
  }

  const loaded = await deps.config.load()
  if (isErr(loaded)) return err({ kind: "failed", detail: "could not load config" })
  const { settings } = loaded.value

  const listed = await deps.registry.list()
  if (isErr(listed)) return err({ kind: "failed", detail: "could not list harnesses" })

  const harness = listed.value.find((h) => h.id === harnessId)
  if (harness === undefined) {
    return err({ kind: "usage", detail: `unknown harness: ${harnessId}` })
  }

  const alias = resolveAlias(harness, flags)
  const proxyUrl = `http://${settings.proxyHost}:${settings.proxyPort}`

  // Ensure a proxy is up. Reuse a running one; otherwise start an ephemeral one.
  let proxyKey = deps.genProxyKey()
  const alreadyRunning = await deps.proxy.isRunning(proxyUrl)
  if (!alreadyRunning) {
    deps.proxy.start({
      host: settings.proxyHost,
      port: settings.proxyPort,
      proxyKey,
      config: loaded.value,
    })
  }
  // When reusing a running proxy we cannot know its key; the launcher still needs *a*
  // value, so the freshly generated one is handed off either way. (It is never printed.)

  const launched = deps.launch({ harness, proxyUrl, proxyKey, model: alias })
  if (isErr(launched)) return err({ kind: "failed", detail: "failed to launch harness" })

  const session = deps.sessions.create({ harnessId: harness.id, alias })
  if (isErr(session)) return err({ kind: "failed", detail: "failed to record session" })

  deps.out.write(`launched ${harness.id} (pid ${launched.value.pid}, session ${session.value.id})`)
  return ok(undefined)
}
```

Then in `run.ts`, import it and replace the `runLaunch` stub:
```typescript
import { launchCommand } from "./launch-command"
// ...
const runLaunch = (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => launchCommand(deps, rest, flags)
```

> `proxy.start` is gated on `!alreadyRunning`, which is exactly what the "reuses the running proxy" / "starts an ephemeral proxy" tests assert via the spy. The `proxyKey` is a local `const` passed only into `proxy.start` and `deps.launch` — it is never interpolated into a `deps.out.write` line, which the "never writes it to the output" test verifies. The success line reports the pid + session id only. A missing harness is a `usage` error (the *command* was valid; the argument was not); dependency failures map to message-safe `failed` errors. `AliasNameSchema.parse` brands the `--model` string into the `AliasName` that `LaunchParams.model` and `SessionInput.alias` require; `AliasNameSchema` validates `.min(1)`, and the flag parser never yields `""` (a `--model` with no following value parses as boolean `true`, not an empty string), so in practice the parse always succeeds.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(cli): add launch command with proxy reuse + session recording [cli-04]`.

---

### Task cli-05: `add` / `remove` provider + alias (mutate config, then save)

**Files:**
- Edit: `packages/cli/src/run.ts` (replace the `runAdd` + `runRemove` stubs)
- Create: `packages/cli/src/mutate-command.ts`
- Test: `packages/cli/src/add-command.test.ts`
- Test: `packages/cli/src/remove-command.test.ts`

`add provider --id <id> --name <name> --sdk <sdkProvider> [--model m ...]` creates a provider with **empty `secrets`** (the GUI sets secrets via `setProviderSecret`; the CLI never sets a secret value). `add alias --name <name> --provider <id> --model <m>` adds an alias. `remove provider <id>` / `remove alias <name>` drop the matching entry. Each mutates the loaded `Config` immutably and calls `config.save(...)`.

> Multiple `--model` values: `parseArgs` keeps only the last value for a repeated flag, so the CLI accepts a single `--model gpt-4o` or a comma list `--model "gpt-4o,gpt-4o-mini"`. `add provider` splits the `--model` value on commas into the `models` array (empty array when the flag is absent).

- [ ] **Step 1: Write the failing tests**

`add-command.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

describe("add provider", () => {
  it("appends a provider with empty secrets and saves the config", async () => {
    const deps = makeFakeDeps()
    const result = await runCli(deps)([
      "add", "provider", "--id", "p_openai", "--name", "OpenAI", "--sdk", "openai", "--model", "gpt-4o,gpt-4o-mini",
    ])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const added = loaded.value.providers.find((p) => p.id === "p_openai")
    expect(added?.name).toBe("OpenAI")
    expect(added?.sdkProvider).toBe("openai")
    expect(added?.models).toEqual(["gpt-4o", "gpt-4o-mini"])
    // SECURITY: the CLI never sets secret values — secrets start empty.
    expect(added?.secrets).toEqual({})
  })

  it("creates a provider with an empty models array when no --model flag is given", async () => {
    const deps = makeFakeDeps()
    await runCli(deps)(["add", "provider", "--id", "p_x", "--name", "X", "--sdk", "anthropic"])
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.providers[0]?.models).toEqual([])
  })

  it("returns a usage error when a required provider flag is missing", async () => {
    const result = await runCli(makeFakeDeps())(["add", "provider", "--id", "p_x", "--name", "X"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a usage error when --sdk is not a known SDK provider", async () => {
    const result = await runCli(makeFakeDeps())([
      "add", "provider", "--id", "p_x", "--name", "X", "--sdk", "not-a-real-sdk",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a failed error when the provider id already exists", async () => {
    const seeded = {
      ...defaultConfig(),
      providers: [
        { id: "p_openai" as never, name: "OpenAI", sdkProvider: "openai" as const, config: {}, secrets: {}, models: [] },
      ],
    }
    const result = await runCli(makeFakeDeps({ initialConfig: seeded }))([
      "add", "provider", "--id", "p_openai", "--name", "Dup", "--sdk", "openai",
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })
})

describe("add alias", () => {
  it("appends an alias mapping and saves the config", async () => {
    const seeded = {
      ...defaultConfig(),
      providers: [
        { id: "p_openai" as never, name: "OpenAI", sdkProvider: "openai" as const, config: {}, secrets: {}, models: ["gpt-4o-mini"] },
      ],
    }
    const deps = makeFakeDeps({ initialConfig: seeded })
    const result = await runCli(deps)([
      "add", "alias", "--name", "fast", "--provider", "p_openai", "--model", "gpt-4o-mini",
    ])
    expect(result).toEqual({ ok: true, value: undefined })

    const loaded = await deps.config.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const added = loaded.value.aliases.find((a) => a.alias === "fast")
    expect(added?.providerId).toBe("p_openai")
    expect(added?.providerModel).toBe("gpt-4o-mini")
  })

  it("returns a usage error when a required alias flag is missing", async () => {
    const result = await runCli(makeFakeDeps())(["add", "alias", "--name", "fast", "--provider", "p_openai"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })

  it("returns a usage error when the add subcommand is unknown", async () => {
    const result = await runCli(makeFakeDeps())(["add", "widget", "--id", "x"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
```

`remove-command.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { defaultConfig } from "@launchkit/config"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const seeded = () => ({
  ...defaultConfig(),
  providers: [
    { id: "p_openai" as never, name: "OpenAI", sdkProvider: "openai" as const, config: {}, secrets: {}, models: [] },
  ],
  aliases: [{ alias: "fast" as never, providerId: "p_openai" as never, providerModel: "gpt-4o-mini" }],
})

describe("remove provider", () => {
  it("drops the matching provider and saves the config", async () => {
    const deps = makeFakeDeps({ initialConfig: seeded() })
    const result = await runCli(deps)(["remove", "provider", "p_openai"])
    expect(result).toEqual({ ok: true, value: undefined })
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.providers).toEqual([])
  })

  it("returns a failed error when the provider id does not exist", async () => {
    const result = await runCli(makeFakeDeps({ initialConfig: seeded() }))(["remove", "provider", "ghost"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })

  it("returns a usage error when no provider id is given", async () => {
    const result = await runCli(makeFakeDeps({ initialConfig: seeded() }))(["remove", "provider"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})

describe("remove alias", () => {
  it("drops the matching alias and saves the config", async () => {
    const deps = makeFakeDeps({ initialConfig: seeded() })
    const result = await runCli(deps)(["remove", "alias", "fast"])
    expect(result).toEqual({ ok: true, value: undefined })
    const loaded = await deps.config.load()
    expect(loaded.ok && loaded.value.aliases).toEqual([])
  })

  it("returns a failed error when the alias name does not exist", async () => {
    const result = await runCli(makeFakeDeps({ initialConfig: seeded() }))(["remove", "alias", "nope"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
  })

  it("returns a usage error when the remove subcommand is unknown", async () => {
    const result = await runCli(makeFakeDeps({ initialConfig: seeded() }))(["remove", "widget", "x"])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("usage")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (the `add`/`remove` stubs return `usage`).

- [ ] **Step 3: Implement `mutate-command.ts`**

```typescript
import { type Result, ok, err, isErr } from "@launchkit/utils"
import { ProviderSchema, ModelAliasSchema, SdkProviderSchema, type Provider, type ModelAlias } from "@launchkit/types"
import type { Config } from "@launchkit/config"
import type { CliError } from "./errors"
import type { CliDeps } from "./deps"

/** Pull a required string flag, or report a usage error naming it. */
const requireFlag = (
  flags: Readonly<Record<string, string | boolean>>,
  name: string,
): Result<string, CliError> => {
  const value = flags[name]
  return typeof value === "string" && value.length > 0
    ? ok(value)
    : err({ kind: "usage", detail: `missing required flag --${name}` })
}

/** Split a comma list flag into trimmed, non-empty entries (empty array when absent). */
const splitModels = (flags: Readonly<Record<string, string | boolean>>): readonly string[] => {
  const value = flags["model"]
  if (typeof value !== "string") return []
  return value.split(",").map((m) => m.trim()).filter((m) => m.length > 0)
}

const saveOrFail = async (
  deps: CliDeps,
  next: Config,
): Promise<Result<void, CliError>> => {
  const saved = await deps.config.save(next)
  return isErr(saved) ? err({ kind: "failed", detail: "could not save config" }) : ok(undefined)
}

const addProvider = async (
  deps: CliDeps,
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const id = requireFlag(flags, "id")
  if (isErr(id)) return id
  const name = requireFlag(flags, "name")
  if (isErr(name)) return name
  const sdk = requireFlag(flags, "sdk")
  if (isErr(sdk)) return sdk

  const sdkParsed = SdkProviderSchema.safeParse(sdk.value)
  if (!sdkParsed.success) {
    return err({ kind: "usage", detail: `unknown --sdk provider: ${sdk.value}` })
  }
  if (config.providers.some((p) => p.id === id.value)) {
    return err({ kind: "failed", detail: `provider already exists: ${id.value}` })
  }

  // SECURITY: secrets start EMPTY — the CLI never sets secret values (the GUI does via
  // setProviderSecret). Validate through ProviderSchema so the branded id is constructed
  // from one source of truth and a bad shape is rejected before save.
  const candidate = ProviderSchema.safeParse({
    id: id.value,
    name: name.value,
    sdkProvider: sdkParsed.data,
    config: {},
    secrets: {},
    models: splitModels(flags),
  })
  if (!candidate.success) {
    return err({ kind: "usage", detail: candidate.error.message })
  }
  const provider: Provider = candidate.data

  return saveOrFail(deps, { ...config, providers: [...config.providers, provider] })
}

const addAlias = async (
  deps: CliDeps,
  config: Config,
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const name = requireFlag(flags, "name")
  if (isErr(name)) return name
  const provider = requireFlag(flags, "provider")
  if (isErr(provider)) return provider
  const model = requireFlag(flags, "model")
  if (isErr(model)) return model

  const candidate = ModelAliasSchema.safeParse({
    alias: name.value,
    providerId: provider.value,
    providerModel: model.value,
  })
  if (!candidate.success) {
    return err({ kind: "usage", detail: candidate.error.message })
  }
  const alias: ModelAlias = candidate.data

  return saveOrFail(deps, { ...config, aliases: [...config.aliases, alias] })
}

/** `add provider …` / `add alias …`. */
export const add = async (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded)) return err({ kind: "failed", detail: "could not load config" })

  const target = rest[0]
  switch (target) {
    case "provider":
      return addProvider(deps, loaded.value, flags)
    case "alias":
      return addAlias(deps, loaded.value, flags)
    default:
      return err({ kind: "usage", detail: "add <provider|alias> --…" })
  }
}

const removeProvider = async (
  deps: CliDeps,
  config: Config,
  id: string | undefined,
): Promise<Result<void, CliError>> => {
  if (id === undefined) return err({ kind: "usage", detail: "remove provider <id>" })
  const next = config.providers.filter((p) => p.id !== id)
  if (next.length === config.providers.length) {
    return err({ kind: "failed", detail: `unknown provider: ${id}` })
  }
  return saveOrFail(deps, { ...config, providers: next })
}

const removeAlias = async (
  deps: CliDeps,
  config: Config,
  name: string | undefined,
): Promise<Result<void, CliError>> => {
  if (name === undefined) return err({ kind: "usage", detail: "remove alias <name>" })
  const next = config.aliases.filter((a) => a.alias !== name)
  if (next.length === config.aliases.length) {
    return err({ kind: "failed", detail: `unknown alias: ${name}` })
  }
  return saveOrFail(deps, { ...config, aliases: next })
}

/** `remove provider <id>` / `remove alias <name>`. */
export const remove = async (
  deps: CliDeps,
  rest: readonly string[],
): Promise<Result<void, CliError>> => {
  const loaded = await deps.config.load()
  if (isErr(loaded)) return err({ kind: "failed", detail: "could not load config" })

  const target = rest[0]
  switch (target) {
    case "provider":
      return removeProvider(deps, loaded.value, rest[1])
    case "alias":
      return removeAlias(deps, loaded.value, rest[1])
    default:
      return err({ kind: "usage", detail: "remove <provider|alias> <id>" })
  }
}
```

Then in `run.ts`, import and replace both stubs:
```typescript
import { add, remove } from "./mutate-command"
// ...
const runAdd = (
  deps: CliDeps,
  rest: readonly string[],
  flags: Readonly<Record<string, string | boolean>>,
): Promise<Result<void, CliError>> => add(deps, rest, flags)

const runRemove = (deps: CliDeps, rest: readonly string[]): Promise<Result<void, CliError>> =>
  remove(deps, rest)
```

> Every mutation is immutable — `{ ...config, providers: [...] }` produces a new `Config`; the input is never mutated (`functional-style.md`). Validating through `ProviderSchema`/`ModelAliasSchema` constructs the branded ids from the single source of truth and rejects bad shapes as a `usage` error *before* `save`, while `config.save` re-validates as defense-in-depth. `add provider` always sets `secrets: {}` — the empty-secrets test fails if a secret value is ever populated here, enforcing "secrets are set in the GUI, not the CLI." A duplicate id or a remove that matches nothing is a `failed` error (the request was well-formed but cannot be satisfied); a missing/unknown subcommand or missing flag is `usage`. `Config` is imported from `@launchkit/config` (its owner); the `Provider`/`ModelAlias` the schemas infer slot straight into `Config.providers`/`Config.aliases` because `ConfigSchema` reuses those very `@launchkit/types` schemas, so no cast is needed.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(cli): add/remove provider+alias that mutate and save config [cli-05]`.

---

### Task cli-06: Barrel + package CLAUDE.md

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/CLAUDE.md`
- Test: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Write the failing test** asserting the public surface re-exports `parseArgs`, `runCli`, the per-command functions, the `Writer`/`MemoryWriter` factory, and the types — and wiring one end-to-end dispatch from the barrel alone.

```typescript
import { describe, it, expect } from "bun:test"
import * as cli from "./index"
import { runCli, createMemoryWriter, parseArgs } from "./index"
import { makeFakeDeps } from "./test-support"

describe("@launchkit/cli barrel", () => {
  it("exports parseArgs, runCli, the commands, and the writer factory when imported", () => {
    for (const name of [
      "parseArgs",
      "runCli",
      "list",
      "launchCommand",
      "add",
      "remove",
      "createMemoryWriter",
    ]) {
      expect(cli).toHaveProperty(name)
    }
  })

  it("parses argv into a command, rest, and flags through the public parseArgs", () => {
    expect(parseArgs(["launch", "claude", "--model", "fast"])).toEqual({
      command: "launch",
      rest: ["claude"],
      flags: { model: "fast" },
    })
  })

  it("runs an unknown command to an unknown-command error through the public runCli", async () => {
    const out = createMemoryWriter()
    const result = await runCli(makeFakeDeps({ out }))(["bogus"])
    expect(result).toEqual({ ok: false, error: { kind: "unknown-command", command: "bogus" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/cli` → FAIL (`Cannot find module "./index"`).

- [ ] **Step 3: Implement `index.ts`** (named re-exports only — no default export, per `01-conventions/typescript.md`; type-only symbols via `export type`, per `verbatimModuleSyntax`). `test-support.ts` is deliberately **not** exported — it is an internal test helper.

```typescript
export type { ParsedArgs } from "./parse-args"
export { parseArgs } from "./parse-args"
export type { Writer, MemoryWriter } from "./writer"
export { createMemoryWriter } from "./writer"
export type { CliError } from "./errors"
export type { CliDeps, StartProxyDeps } from "./deps"
export { runCli } from "./run"
export { list } from "./list"
export { launchCommand } from "./launch-command"
export { add, remove } from "./mutate-command"
```

> `Config`, `Provider`, `ModelAlias`, `LaunchParams`, `RunningProxy`, `ConfigStore`, `SecretStore`, `SessionStore` are **not** re-exported here — they are owned by their respective packages; consumers (and `apps/desktop`) import them from there. This barrel exposes only the CLI's own surface: argv parsing, the runner, the command functions, and the `Writer` seam (+ its fake).

- [ ] **Step 4: Create `packages/cli/CLAUDE.md`** from the `cli` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# @launchkit/cli

**Responsibility:** argv parsing + the `launch` / `list` / `add` / `remove` commands, orchestrating the other packages.

**Public API (barrel `src/index.ts`):** `parseArgs` + `ParsedArgs`; `runCli(deps)(argv)`; the per-command functions `list`, `launchCommand`, `add`, `remove`; the `Writer`/`MemoryWriter` interface + `createMemoryWriter()` (test fake); `CliError`; `CliDeps` + `StartProxyDeps`.

**Depends on:** `@launchkit/types`, `@launchkit/utils`, `@launchkit/config`, `@launchkit/secrets`, `@launchkit/proxy`, `@launchkit/harnesses`, `@launchkit/sessions` — see build-plan/02-monorepo/boundaries.md.

**Effects owned:** none directly — every effect (config file, keychain, proxy server, process spawn, sqlite) arrives through an injected interface on `CliDeps`. The app shell (`apps/desktop`) constructs the real adapters and injects them.

**Local rules:** commands are PURE functions over injected deps; they never import `node:fs`, `Bun.spawn`, the keychain, or open a socket directly. All output goes through the injected `Writer` (never `console.log`), so tests assert on recorded lines. Errors are returned as `Result<void, CliError>` — nothing throws. SECURITY: never print a secret value or keychain ref (`list providers` shows id/name/sdkProvider only); the per-run proxy key from `genProxyKey()` flows into `launch`/`proxy.start` only and is never written to output; `add provider` creates providers with empty `secrets` (the GUI sets secret values via `setProviderSecret`).
```

- [ ] **Step 5: Run, expect GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(cli): add public barrel + CLAUDE.md [cli-06]`.

**End state:** `@launchkit/cli` exports a pure `parseArgs` tokenizer and a `runCli(deps)(argv)` entry point that dispatches the four commands — `launch`, `list`, `add`, `remove` — each implemented as a pure function over the injected `CliDeps` (`ConfigStore`, `SecretStore`, the harness registry + `launch` launcher, the proxy `isRunning`/`start` seam, `SessionStore`, an output `Writer`, and `genProxyKey`). All output flows through the injected `Writer`, every failure is a typed `CliError` (`unknown-command` / `usage` / `failed`), and nothing throws. `launch` loads config, resolves the alias from `--model` or the harness `defaultAlias`, reuses a running proxy (or starts an ephemeral one with a freshly generated per-run key), launches the harness, records a session, and prints the pid + session id. `list` prints harnesses / providers / aliases without ever revealing a secret ref or value; `add`/`remove` mutate the loaded `Config` immutably and `save` it, with `add provider` always creating empty `secrets` (secrets are set in the GUI via `setProviderSecret`). Security is enforced and tested: the proxy key never reaches the `Writer`, secret values/refs are never printed, and the CLI touches no effect directly. Commands are unit-tested with the in-memory fakes from the dependency packages (`makeFakeDeps`); the app shell injects the real adapters. Consumers `import { runCli, parseArgs, createMemoryWriter, type CliDeps } from "@launchkit/cli"`.
