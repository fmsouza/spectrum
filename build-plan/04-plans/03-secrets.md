# @launchkit/secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide keychain-backed secret storage so `config.json` only ever stores `SecretRef`s, never raw API keys. Expose a `SecretStore` (set/get/delete/has) over an injected `KeychainBackend` effect, with an in-memory fake for tests and a real macOS `security`-CLI backend driven through an injected `ProcessRunner`.

**Architecture:** Effects-at-the-edges, per `01-conventions/functional-style.md`. The keychain is an effect, expressed as the `KeychainBackend` interface; spawning the `security` binary is a second effect, expressed as the `ProcessRunner` interface. `createSecretStore` is pure orchestration over an injected backend + `IdGen` — `set` mints a fresh ref via `idGen.next("kc")`, stores the value under it, and returns the `SecretRef`. Unit tests inject `createInMemoryKeychainBackend()` + `createSequentialIdGen()`; the real macOS backend and real `ProcessRunner` each get exercised in a darwin-only `*.integration.test.ts`. Security (`01-conventions/security.md`) is baked in: spawn with **argument arrays only** (asserted in tests), the service name is always `"launchkit"`, and `redactSecrets` scrubs the stored value out of every returned error `detail` so a key can never leak through an error.

**Tech Stack:** TypeScript (strict), `bun:test`. No external runtime deps — the real backend shells out to the OS `security` CLI via `Bun.spawn` (argument arrays, never a shell string).

> Depends on: `types`, `utils`. Read `01-conventions/functional-style.md` + `security.md`. Imports `SecretRef` / `SecretRefSchema` from `@launchkit/types`; imports `Result`, `ok`, `err`, `isOk`, `isErr`, `redactSecrets`, and the `IdGen` interface (`next(prefix)`, with `createCryptoIdGen()` / `createSequentialIdGen()`) from `@launchkit/utils`. These are locked contracts — do not redefine them.
> Create the package first via the `launchkit-new-package` skill: `packages/secrets`, deps `@launchkit/types`, `@launchkit/utils`.

---

### Task secrets-01: SecretError + KeychainBackend interface + in-memory fake

**Files:**
- Create: `packages/secrets/src/backend.ts`
- Test: `packages/secrets/src/backend.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { isOk, isErr } from "@launchkit/utils"
import { createInMemoryKeychainBackend } from "./backend"

describe("createInMemoryKeychainBackend", () => {
  it("stores a secret and finds it back when add then find is called", async () => {
    const backend = createInMemoryKeychainBackend()
    const added = await backend.add("kc_1", "sk-secret")
    expect(isOk(added)).toBe(true)

    const found = await backend.find("kc_1")
    expect(found).toEqual({ ok: true, value: "sk-secret" })
  })

  it("returns a not-found error when find is called for an unknown account", async () => {
    const backend = createInMemoryKeychainBackend()
    const found = await backend.find("kc_missing")
    expect(found).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("overwrites the stored value when add is called twice for the same account", async () => {
    const backend = createInMemoryKeychainBackend()
    await backend.add("kc_1", "first")
    await backend.add("kc_1", "second")
    const found = await backend.find("kc_1")
    expect(found).toEqual({ ok: true, value: "second" })
  })

  it("removes a stored secret so a later find returns not-found", async () => {
    const backend = createInMemoryKeychainBackend()
    await backend.add("kc_1", "sk-secret")
    const removed = await backend.remove("kc_1")
    expect(isOk(removed)).toBe(true)

    const found = await backend.find("kc_1")
    expect(isErr(found)).toBe(true)
    if (isErr(found)) expect(found.error.kind).toBe("not-found")
  })

  it("returns a not-found error when remove is called for an unknown account", async () => {
    const backend = createInMemoryKeychainBackend()
    const removed = await backend.remove("kc_missing")
    expect(removed).toEqual({ ok: false, error: { kind: "not-found" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/secrets` → FAIL (`Cannot find module "./backend"`).

- [ ] **Step 3: Implement `backend.ts`**

```typescript
import { type Result, ok, err } from "@launchkit/utils"

/** Typed failure modes for any keychain operation. */
export type SecretError =
  | { readonly kind: "not-found" }
  | { readonly kind: "backend-failed"; readonly detail: string }

/**
 * The keychain effect. The only thing `SecretStore` knows about the OS keychain.
 * `account` is the keychain-id the secret is stored under (a `SecretRef.ref`).
 */
export interface KeychainBackend {
  add(account: string, secret: string): Promise<Result<void, SecretError>>
  find(account: string): Promise<Result<string, SecretError>>
  remove(account: string): Promise<Result<void, SecretError>>
}

/** Map-based fake for unit tests — no real keychain, fast, deterministic. */
export const createInMemoryKeychainBackend = (): KeychainBackend => {
  const store = new Map<string, string>()
  return {
    add: async (account, secret) => {
      store.set(account, secret)
      return ok(undefined)
    },
    find: async (account) => {
      const secret = store.get(account)
      return secret === undefined ? err({ kind: "not-found" }) : ok(secret)
    },
    remove: async (account) => {
      if (!store.has(account)) return err({ kind: "not-found" })
      store.delete(account)
      return ok(undefined)
    },
  }
}
```

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(secrets): add SecretError + KeychainBackend + in-memory fake [secrets-01]`.

---

### Task secrets-02: createSecretStore (set/get/delete/has against the fake)

**Files:**
- Create: `packages/secrets/src/store.ts`
- Test: `packages/secrets/src/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createSequentialIdGen } from "@launchkit/utils"
import { createInMemoryKeychainBackend } from "./backend"
import { createSecretStore } from "./store"

const makeStore = () => {
  const backend = createInMemoryKeychainBackend()
  const idGen = createSequentialIdGen()
  return { backend, store: createSecretStore({ backend, idGen }) }
}

describe("createSecretStore", () => {
  it("mints a kc-prefixed ref via the IdGen and returns it when set is called", async () => {
    const { store } = makeStore()
    const result = await store.set("sk-secret")
    expect(result).toEqual({ ok: true, value: { ref: "kc_1" } })
  })

  it("stores the value under the minted ref so get returns it", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    expect(set.ok).toBe(true)
    if (!set.ok) return

    const got = await store.get(set.value)
    expect(got).toEqual({ ok: true, value: "sk-secret" })
  })

  it("uses a fresh ref for each set so two secrets do not collide", async () => {
    const { store } = makeStore()
    const a = await store.set("secret-a")
    const b = await store.set("secret-b")
    expect(a).toEqual({ ok: true, value: { ref: "kc_1" } })
    expect(b).toEqual({ ok: true, value: { ref: "kc_2" } })
  })

  it("returns a not-found error when get is called for a ref that was never set", async () => {
    const { store } = makeStore()
    const got = await store.get({ ref: "kc_999" })
    expect(got).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("deletes the secret so a later get returns not-found", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    if (!set.ok) return

    const deleted = await store.delete(set.value)
    expect(deleted).toEqual({ ok: true, value: undefined })

    const got = await store.get(set.value)
    expect(got).toEqual({ ok: false, error: { kind: "not-found" } })
  })

  it("reports true from has when the ref exists and false otherwise", async () => {
    const { store } = makeStore()
    const set = await store.set("sk-secret")
    if (!set.ok) return

    expect(await store.has(set.value)).toBe(true)
    expect(await store.has({ ref: "kc_absent" })).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/secrets` → FAIL (`Cannot find module "./store"`).

- [ ] **Step 3: Implement `store.ts`**

```typescript
import type { SecretRef } from "@launchkit/types"
import { type Result, ok, isOk, type IdGen } from "@launchkit/utils"
import type { KeychainBackend, SecretError } from "./backend"

/**
 * Persists secret values in the keychain and hands back opaque `SecretRef`s.
 * `config.json` stores only these refs — never the raw value.
 */
export interface SecretStore {
  /** Mint a new ref, store `value` under it, return the ref. */
  set(value: string): Promise<Result<SecretRef, SecretError>>
  get(ref: SecretRef): Promise<Result<string, SecretError>>
  delete(ref: SecretRef): Promise<Result<void, SecretError>>
  has(ref: SecretRef): Promise<boolean>
}

export const createSecretStore = (deps: {
  readonly backend: KeychainBackend
  readonly idGen: IdGen
}): SecretStore => {
  const { backend, idGen } = deps
  return {
    set: async (value) => {
      const ref = idGen.next("kc")
      const added = await backend.add(ref, value)
      return isOk(added) ? ok({ ref }) : added
    },
    get: (ref) => backend.find(ref.ref),
    delete: (ref) => backend.remove(ref.ref),
    has: async (ref) => isOk(await backend.find(ref.ref)),
  }
}
```

> `set` returns the backend's `Err` unchanged when `add` fails (both are `Result<…, SecretError>`), so a `backend-failed` propagates without re-wrapping. `next("kc")` is the locked prefix from `@launchkit/utils`.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(secrets): add createSecretStore over injected backend + IdGen [secrets-02]`.

---

### Task secrets-03: createMacosSecurityBackend (exact arg arrays + find parsing + redaction)

**Files:**
- Create: `packages/secrets/src/macos-backend.ts`
- Test: `packages/secrets/src/macos-backend.test.ts`

- [ ] **Step 1: Write the failing test** — inject a recording `ProcessRunner` fake so we assert the **exact argument arrays** (security must-have: arg arrays only), the find-stdout parsing (trailing newline trimmed), and that `redactSecrets` keeps the secret out of any returned error `detail`.

```typescript
import { describe, it, expect } from "bun:test"
import { type Result, ok, err } from "@launchkit/utils"
import type { SecretError, KeychainBackend } from "./backend"
import type { ProcessRunner } from "./process-runner"
import { createMacosSecurityBackend } from "./macos-backend"

type Call = { readonly command: string; readonly args: readonly string[] }

/** Records every invocation and replays a queued result per call. */
const recordingRunner = (
  results: ReadonlyArray<Result<{ stdout: string }, SecretError>>,
): { runner: ProcessRunner; calls: Call[] } => {
  const calls: Call[] = []
  let i = 0
  const runner: ProcessRunner = {
    run: async (command, args) => {
      calls.push({ command, args })
      const result = results[i] ?? ok({ stdout: "" })
      i += 1
      return result
    },
  }
  return { runner, calls }
}

describe("createMacosSecurityBackend", () => {
  it("invokes the security CLI with the exact add-generic-password arg array when add is called", async () => {
    const { runner, calls } = recordingRunner([ok({ stdout: "" })])
    const backend: KeychainBackend = createMacosSecurityBackend({ runner })

    const result = await backend.add("kc_1", "sk-secret")

    expect(result).toEqual({ ok: true, value: undefined })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("security")
    expect(calls[0]?.args).toEqual([
      "add-generic-password", "-a", "kc_1", "-s", "launchkit", "-w", "sk-secret", "-U",
    ])
  })

  it("invokes the exact find-generic-password arg array and trims the trailing newline from stdout when find is called", async () => {
    const { runner, calls } = recordingRunner([ok({ stdout: "sk-secret\n" })])
    const backend = createMacosSecurityBackend({ runner })

    const result = await backend.find("kc_1")

    expect(result).toEqual({ ok: true, value: "sk-secret" })
    expect(calls[0]?.args).toEqual([
      "find-generic-password", "-a", "kc_1", "-s", "launchkit", "-w",
    ])
  })

  it("invokes the exact delete-generic-password arg array when remove is called", async () => {
    const { runner, calls } = recordingRunner([ok({ stdout: "" })])
    const backend = createMacosSecurityBackend({ runner })

    const result = await backend.remove("kc_1")

    expect(result).toEqual({ ok: true, value: undefined })
    expect(calls[0]?.args).toEqual([
      "delete-generic-password", "-a", "kc_1", "-s", "launchkit",
    ])
  })

  it("redacts the secret value out of the error detail so a failed add never leaks the key", async () => {
    const { runner } = recordingRunner([
      err({ kind: "backend-failed", detail: "security: write failed for sk-secret near keychain" }),
    ])
    const backend = createMacosSecurityBackend({ runner })

    const result = await backend.add("kc_1", "sk-secret")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("backend-failed")
    if (result.error.kind !== "backend-failed") return
    expect(result.error.detail).not.toContain("sk-secret")
    expect(result.error.detail).toContain("[REDACTED]")
  })

  it("passes a not-found error through unchanged when find reports the account is missing", async () => {
    const { runner } = recordingRunner([err({ kind: "not-found" })])
    const backend = createMacosSecurityBackend({ runner })

    const result = await backend.find("kc_missing")

    expect(result).toEqual({ ok: false, error: { kind: "not-found" } })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/secrets` → FAIL (`Cannot find module "./macos-backend"` / `"./process-runner"`).

- [ ] **Step 3: Implement `process-runner.ts` (interface only)**

```typescript
import type { Result } from "@launchkit/utils"
import type { SecretError } from "./backend"

/**
 * The process-spawn effect for the real keychain backend.
 * `command` + `args` are passed as an argument array — never joined into a shell string.
 */
export interface ProcessRunner {
  run(command: string, args: readonly string[]): Promise<Result<{ stdout: string }, SecretError>>
}
```

- [ ] **Step 4: Implement `macos-backend.ts`**

```typescript
import { type Result, ok, err, isOk, redactSecrets } from "@launchkit/utils"
import type { KeychainBackend, SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"

const SERVICE = "launchkit"

/** Scrub the live secret out of any backend-failed detail before it propagates. */
const redactError = (error: SecretError, secrets: readonly string[]): SecretError =>
  error.kind === "backend-failed"
    ? { kind: "backend-failed", detail: redactSecrets(error.detail, secrets) }
    : error

export const createMacosSecurityBackend = (deps: {
  readonly runner: ProcessRunner
}): KeychainBackend => {
  const { runner } = deps
  return {
    add: async (account, secret) => {
      const result = await runner.run("security", [
        "add-generic-password", "-a", account, "-s", SERVICE, "-w", secret, "-U",
      ])
      return isOk(result) ? ok(undefined) : err(redactError(result.error, [secret]))
    },
    find: async (account) => {
      const result = await runner.run("security", [
        "find-generic-password", "-a", account, "-s", SERVICE, "-w",
      ])
      if (!isOk(result)) return err(redactError(result.error, []))
      return ok(result.value.stdout.replace(/\n$/, ""))
    },
    remove: async (account) => {
      const result = await runner.run("security", [
        "delete-generic-password", "-a", account, "-s", SERVICE,
      ])
      return isOk(result) ? ok(undefined) : err(redactError(result.error, []))
    },
  }
}
```

> Security must-haves enforced here: the arg array is fixed and asserted in tests (no shell string); the service name is the literal `"launchkit"`; `add` runs its detail through `redactSecrets([secret])` so the value can never appear in an error surfaced to logs or the GUI. `find`/`remove` have no secret in scope, so they redact against an empty list (still routed through `redactError` for one consistent error path). The trailing `\n` that the `security -w` flag appends to the secret is trimmed.

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(secrets): add macOS security-CLI backend with arg-array + redaction guarantees [secrets-03]`.

---

### Task secrets-04: createBunProcessRunner + darwin-only integration round-trip

**Files:**
- Create: `packages/secrets/src/bun-process-runner.ts`
- Test: `packages/secrets/src/bun-process-runner.test.ts`
- Test: `packages/secrets/src/macos-backend.integration.test.ts`

- [ ] **Step 1: Write the failing unit test** for `createBunProcessRunner`. Use a trivially portable command (`true` exits 0, `false` exits non-zero) to prove it spawns with an arg array and maps exit codes to `Result` without touching the keychain.

```typescript
import { describe, it, expect } from "bun:test"
import { createBunProcessRunner } from "./bun-process-runner"

describe("createBunProcessRunner", () => {
  it("returns an Ok carrying captured stdout when the command exits zero", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("printf", ["hello"])
    expect(result).toEqual({ ok: true, value: { stdout: "hello" } })
  })

  it("returns a backend-failed error when the command exits non-zero", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("false", [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("backend-failed")
  })

  it("returns a backend-failed error when the command cannot be spawned", async () => {
    const runner = createBunProcessRunner()
    const result = await runner.run("launchkit-no-such-binary-xyz", [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("backend-failed")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/secrets` → FAIL (`Cannot find module "./bun-process-runner"`).

- [ ] **Step 3: Implement `bun-process-runner.ts`** using `Bun.spawn` with an **argument array** (security must-have: never a shell string).

```typescript
import { type Result, ok, err } from "@launchkit/utils"
import type { SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"

/**
 * Real `ProcessRunner` backed by `Bun.spawn`. The command and its args are passed
 * as a single argument array `[command, ...args]` — there is no shell, no string
 * interpolation, so secret arguments cannot be reinterpreted by a shell.
 */
export const createBunProcessRunner = (): ProcessRunner => ({
  run: async (
    command: string,
    args: readonly string[],
  ): Promise<Result<{ stdout: string }, SecretError>> => {
    try {
      const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (exitCode !== 0) {
        return err({ kind: "backend-failed", detail: `exit ${exitCode}: ${stderr.trim()}` })
      }
      return ok({ stdout })
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "backend-failed", detail })
    }
  },
})
```

> The `try/catch` converts a failed spawn (e.g. command not on `PATH`) into a typed `backend-failed` error — fallible IO becomes a `Result`, never a thrown exception. `stderr` is included in the detail; the caller (`createMacosSecurityBackend.add`) runs that detail through `redactSecrets` before it ever propagates, so a secret echoed in stderr is scrubbed.

- [ ] **Step 4: Write the failing integration test** — a darwin-only round-trip through the **real** `security` CLI. It writes a uniquely-named secret, reads it back, deletes it, and confirms it is gone. Skip the whole suite on non-darwin so CI on other platforms stays green.

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { isOk } from "@launchkit/utils"
import { createMacosSecurityBackend } from "./macos-backend"
import { createBunProcessRunner } from "./bun-process-runner"

// The real `security` CLI only exists on macOS — skip elsewhere.
const onDarwin = process.platform === "darwin"
const describeDarwin = onDarwin ? describe : describe.skip

describeDarwin("createMacosSecurityBackend (real security CLI)", () => {
  const backend = createMacosSecurityBackend({ runner: createBunProcessRunner() })
  // Unique per run so concurrent/leftover runs never collide in the shared keychain.
  const account = `kc_launchkit_test_${crypto.randomUUID()}`

  afterEach(async () => {
    // Best-effort cleanup; ignore not-found if a test already removed it.
    await backend.remove(account)
  })

  it("round-trips a secret through the macOS keychain when add then find then remove run", async () => {
    const secret = `sk-test-${crypto.randomUUID()}`

    const added = await backend.add(account, secret)
    expect(isOk(added)).toBe(true)

    const found = await backend.find(account)
    expect(found).toEqual({ ok: true, value: secret })

    const removed = await backend.remove(account)
    expect(isOk(removed)).toBe(true)

    const afterRemove = await backend.find(account)
    expect(afterRemove).toEqual({ ok: false, error: { kind: "not-found" } })
  })
})
```

> The find/remove arg arrays in `macos-backend.ts` map a missing account to `not-found` only if the runner returns `not-found`. The real `security find-generic-password` exits non-zero for a missing item, so `createBunProcessRunner` returns `backend-failed`, not `not-found`. To make the final assertion hold, extend `find`/`remove` in `macos-backend.ts` to recognize the CLI's "could not be found" failure as `not-found` (see Step 5) — write this test first so that need is driven by a failing assertion.

- [ ] **Step 5: Run, expect RED, then make it GREEN** — on darwin the round-trip's final assertion fails because a missing item arrives as `backend-failed`. Map it to `not-found` in `macos-backend.ts` by detecting the CLI's signature message. Replace the `find` and `remove` bodies with this shared helper:

```typescript
// add near the top of macos-backend.ts, after SERVICE:
const NOT_FOUND_MARKER = "could not be found"

const classifyError = (error: SecretError, secrets: readonly string[]): SecretError => {
  if (error.kind === "backend-failed" && error.detail.includes(NOT_FOUND_MARKER)) {
    return { kind: "not-found" }
  }
  return redactError(error, secrets)
}
```

```typescript
// then in createMacosSecurityBackend, use classifyError for find/remove:
    find: async (account) => {
      const result = await runner.run("security", [
        "find-generic-password", "-a", account, "-s", SERVICE, "-w",
      ])
      if (!isOk(result)) return err(classifyError(result.error, []))
      return ok(result.value.stdout.replace(/\n$/, ""))
    },
    remove: async (account) => {
      const result = await runner.run("security", [
        "delete-generic-password", "-a", account, "-s", SERVICE,
      ])
      return isOk(result) ? ok(undefined) : err(classifyError(result.error, []))
    },
```

> `add` keeps using `redactError([secret])` (a failed add is a real failure, not "not found"). The unit test from secrets-03 ("passes a not-found error through unchanged when find reports the account is missing") still passes: when the fake returns `{ kind: "not-found" }` directly, `classifyError` falls through to `redactError`, which returns the `not-found` unchanged.

- [ ] **Step 6: Run, expect GREEN** — `bun test packages/secrets` (the integration suite runs and passes on macOS; it is skipped elsewhere). **Step 7: Commit** `feat(secrets): add Bun ProcessRunner + darwin keychain integration round-trip [secrets-04]`.

---

### Task secrets-05: Barrel + package CLAUDE.md

**Files:**
- Create: `packages/secrets/src/index.ts`
- Create: `packages/secrets/CLAUDE.md`
- Test: `packages/secrets/src/index.test.ts`

- [ ] **Step 1: Write the failing test** asserting the public surface re-exports every factory + type the package promises.

```typescript
import { describe, it, expect } from "bun:test"
import * as secrets from "./index"

describe("@launchkit/secrets barrel", () => {
  it("exports every public factory when imported", () => {
    for (const name of [
      "createSecretStore",
      "createInMemoryKeychainBackend",
      "createMacosSecurityBackend",
      "createBunProcessRunner",
    ]) {
      expect(secrets).toHaveProperty(name)
    }
  })

  it("wires an end-to-end set/get round-trip through the in-memory backend from the barrel", async () => {
    const backend = secrets.createInMemoryKeychainBackend()
    const idGen = { next: (prefix: string) => `${prefix}_fixed` }
    const store = secrets.createSecretStore({ backend, idGen })

    const set = await store.set("sk-secret")
    expect(set).toEqual({ ok: true, value: { ref: "kc_fixed" } })

    const got = await store.get({ ref: "kc_fixed" })
    expect(got).toEqual({ ok: true, value: "sk-secret" })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/secrets` → FAIL (`Cannot find module "./index"`).

- [ ] **Step 3: Implement `index.ts`** (named re-exports only — no default export, per `01-conventions/typescript.md`).

```typescript
export type { SecretError, KeychainBackend } from "./backend"
export { createInMemoryKeychainBackend } from "./backend"
export type { SecretStore } from "./store"
export { createSecretStore } from "./store"
export type { ProcessRunner } from "./process-runner"
export { createBunProcessRunner } from "./bun-process-runner"
export { createMacosSecurityBackend } from "./macos-backend"
```

> Types are re-exported with `export type { … }` (`verbatimModuleSyntax` requires type-only exports). `SecretRef` itself is **not** re-exported here — it is owned by `@launchkit/types`; consumers import it from there.

- [ ] **Step 4: Create `packages/secrets/CLAUDE.md`** from the `secrets` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# @launchkit/secrets

**Responsibility:** Keychain-backed secret storage so `config.json` stores only `SecretRef`s, never raw API keys.

**Public API (barrel `src/index.ts`):** `SecretStore` + `createSecretStore({ backend, idGen })`; `KeychainBackend` + `createInMemoryKeychainBackend()` (test fake) + `createMacosSecurityBackend({ runner })`; `ProcessRunner` + `createBunProcessRunner()`; `SecretError`.

**Depends on:** `@launchkit/types` (`SecretRef`), `@launchkit/utils` (`Result`, `redactSecrets`, `IdGen`) — see build-plan/02-monorepo/boundaries.md.

**Effects owned:** keychain (via the `KeychainBackend` interface) + process spawn (via the `ProcessRunner` interface) — exposed to consumers as injected interfaces; never reached around.

**Local rules:** expose the `SecretStore` interface + real macOS adapter + in-memory fake. Secrets are NEVER logged, embedded in an error `detail`, or returned to the webview — run any CLI output through `redactSecrets` first. Spawn the `security` CLI with argument arrays only (never a shell string). The keychain service name is always `"launchkit"`. `set` mints a ref via `idGen.next("kc")`.
```

- [ ] **Step 5: Run, expect GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 6: Update PROGRESS.md, commit** `feat(secrets): add public barrel + CLAUDE.md [secrets-05]`.

**End state:** `@launchkit/secrets` exports a `SecretStore` (`set`/`get`/`delete`/`has`) over an injected `KeychainBackend`, an in-memory fake for unit tests, and a real macOS backend (`createMacosSecurityBackend`) driven by an injected `ProcessRunner` whose production adapter (`createBunProcessRunner`) spawns the `security` CLI with argument arrays only. `set` mints keychain ids via `idGen.next("kc")` and returns a `SecretRef`, so `config.json` ever only holds references. Secret values never appear in logs or error details (`redactSecrets` is applied to every CLI-failure path), the service name is fixed to `"launchkit"`, and the real keychain is exercised by a darwin-only `*.integration.test.ts` that skips cleanly on other platforms. Consumers `import { createSecretStore, createMacosSecurityBackend, createBunProcessRunner } from "@launchkit/secrets"` and inject the fake backend in their own tests.
