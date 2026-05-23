# @launchkit/ipc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the typed GUI↔main IPC contract — one zod schema per method (validated **on receive in both directions**), an `IpcMethods` map, and `createIpcClient`/`createIpcServer` helpers over an **injected transport** — so the boundary is fully validated, testable with no Electrobun, and **never carries secret values out to the webview**.

**Architecture:** Schema-first and transport-agnostic. Every method has a `XParamsSchema` + `XResultSchema`; the runtime validates the payload it *receives* (client validates params before send + result after receive; server validates params before dispatch + result before reply). Effects (the actual Electrobun message bus) live behind two tiny injected interfaces — `ClientTransport` and `ServerTransport` — so the whole package is unit-tested with in-memory fakes. **Security is baked into the types:** a `ProviderView` replaces `Provider.secrets` with `secretFields: Record<string, { isSet: boolean }>`, so no `ref` and no value ever flows main→webview; raw secret values arrive *only* inbound via `setProviderSecret`. This bakes `01-conventions/security.md` ("secrets never cross IPC to the webview") into the contract.

**Tech Stack:** TypeScript (strict), zod, `bun:test`. Depends only on `@launchkit/types` + `@launchkit/utils`.

> Depends on: `types`, `utils` (both `done`). Read `build-plan/01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, and especially `security.md` (IPC + secrets sections). No new external deps beyond `zod` (already owned).
> Create the package via the `launchkit-new-package` skill: `packages/ipc`, deps `@launchkit/types`, `@launchkit/utils`, `zod`.

---

### Task ipc-01: `ProviderView` + `ProviderViewSchema` (secret-free projection)

**Files:**
- Create: `packages/ipc/src/provider-view.ts`
- Test: `packages/ipc/src/provider-view.test.ts`

`ProviderView` is the *only* provider shape that travels main→webview. It mirrors `Provider` but its `secrets` field is replaced by `secretFields: Record<string, { isSet: boolean }>` — presence flags only, **no `ref`, no value**.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { ProviderViewSchema } from "./provider-view"

const view = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o", "gpt-4o-mini"],
}

describe("ProviderViewSchema", () => {
  it("parses a valid provider view with presence-only secret fields", () => {
    expect(ProviderViewSchema.parse(view)).toEqual(view)
  })
  it("rejects a secret field that carries a ref", () => {
    expect(ProviderViewSchema.safeParse({ ...view, secretFields: { apiKey: { isSet: true, ref: "kc_x" } } }).success).toBe(false)
  })
  it("rejects a secret field that carries a raw value", () => {
    expect(ProviderViewSchema.safeParse({ ...view, secretFields: { apiKey: { isSet: true, value: "sk-xxx" } } }).success).toBe(false)
  })
  it("rejects an unknown sdkProvider", () => {
    expect(ProviderViewSchema.safeParse({ ...view, sdkProvider: "nope" }).success).toBe(false)
  })
  it("rejects unknown top-level fields", () => {
    expect(ProviderViewSchema.safeParse({ ...view, extra: 1 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/ipc` → FAIL (module not found).

- [ ] **Step 3: Implement `provider-view.ts`**

```typescript
import { z } from "zod"
import { ProviderIdSchema, SdkProviderSchema } from "@launchkit/types"

/** Presence flag for one secret field — never a `ref`, never a value. */
export const SecretFieldStatusSchema = z.object({ isSet: z.boolean() }).strict()
export type SecretFieldStatus = z.infer<typeof SecretFieldStatusSchema>

/**
 * The provider shape exposed to the webview. Identical to `Provider` except
 * `secrets` (keychain refs) is replaced by `secretFields` (presence flags only),
 * enforcing `security.md`: no secret value or ref ever crosses IPC to the GUI.
 */
export const ProviderViewSchema = z.object({
  id: ProviderIdSchema,
  name: z.string().min(1),
  sdkProvider: SdkProviderSchema,
  config: z.record(z.string(), z.string()),
  secretFields: z.record(z.string(), SecretFieldStatusSchema),
  models: z.array(z.string()),
}).strict()

export type ProviderView = z.infer<typeof ProviderViewSchema>
```
> `.strict()` on `SecretFieldStatusSchema` makes the `ref`/`value` tests fail — the type *cannot* carry a secret. `ProviderViewSchema` deliberately has no `secrets` key.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(ipc): add secret-free ProviderView schema [ipc-01]`.

---

### Task ipc-02: Per-method Params/Result schemas + the `IpcMethods` map

**Files:**
- Create: `packages/ipc/src/methods.ts`
- Test: `packages/ipc/src/methods.test.ts`

One `XParamsSchema` + `XResultSchema` per contract method (the architecture's CRUD list). Inputs that create/update a provider accept non-secret `config` + the *names* of secret fields, **never** secret values. Every method returning a provider returns a `ProviderView`. `setProviderSecret` is the only method whose params carry a raw secret value, and it returns `void`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import {
  AddProviderParamsSchema,
  SetProviderSecretParamsSchema,
  LaunchHarnessParamsSchema,
  GetSessionsParamsSchema,
  IpcMethodSchemas,
} from "./methods"

describe("AddProviderParamsSchema", () => {
  it("parses an input with non-secret config and secret field names", () => {
    const input = {
      name: "OpenAI",
      sdkProvider: "openai",
      config: { baseUrl: "https://api.openai.com/v1" },
      secretFieldNames: ["apiKey"],
      models: ["gpt-4o"],
    }
    expect(AddProviderParamsSchema.parse(input)).toEqual(input)
  })
  it("rejects an add-provider input that smuggles a secret value", () => {
    const input = {
      name: "OpenAI",
      sdkProvider: "openai",
      config: { baseUrl: "x" },
      secretFieldNames: ["apiKey"],
      models: ["gpt-4o"],
      secrets: { apiKey: "sk-leak" },
    }
    expect(AddProviderParamsSchema.safeParse(input).success).toBe(false)
  })
})

describe("SetProviderSecretParamsSchema", () => {
  it("parses the only secret-bearing method's params", () => {
    const p = { providerId: "p_openai", field: "apiKey", value: "sk-secret" }
    expect(SetProviderSecretParamsSchema.parse(p)).toEqual(p)
  })
  it("rejects an empty secret value", () => {
    expect(SetProviderSecretParamsSchema.safeParse({ providerId: "p", field: "apiKey", value: "" }).success).toBe(false)
  })
})

describe("LaunchHarnessParamsSchema", () => {
  it("parses with an optional alias omitted", () => {
    expect(LaunchHarnessParamsSchema.parse({ id: "claude" })).toEqual({ id: "claude" })
  })
  it("parses with an alias provided", () => {
    expect(LaunchHarnessParamsSchema.parse({ id: "claude", alias: "fast" })).toEqual({ id: "claude", alias: "fast" })
  })
})

describe("GetSessionsParamsSchema", () => {
  it("parses an absent filter as undefined", () => {
    expect(GetSessionsParamsSchema.parse(undefined)).toBeUndefined()
  })
  it("parses a filter narrowing by harnessId", () => {
    expect(GetSessionsParamsSchema.parse({ harnessId: "claude" })).toEqual({ harnessId: "claude" })
  })
})

describe("IpcMethodSchemas", () => {
  it("exposes a params and result schema for every contract method", () => {
    const expected = [
      "getProviders", "addProvider", "updateProvider", "deleteProvider", "testProvider", "setProviderSecret",
      "getAliases", "addAlias", "updateAlias", "deleteAlias",
      "getHarnesses", "addHarness", "updateHarness", "deleteHarness", "launchHarness",
      "getSessions", "getProxyStatus",
    ] as const
    for (const name of expected) {
      expect(IpcMethodSchemas[name]).toBeDefined()
      expect(IpcMethodSchemas[name].params).toBeDefined()
      expect(IpcMethodSchemas[name].result).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `methods.ts`** (full code for every method; the add/update/delete trio of each resource is grouped adjacently but each has real schemas)

```typescript
import { z } from "zod"
import {
  ProviderIdSchema,
  SdkProviderSchema,
  AliasNameSchema,
  HarnessIdSchema,
  ModelAliasSchema,
  HarnessDefinitionSchema,
  SessionSchema,
} from "@launchkit/types"
import { ProviderViewSchema } from "./provider-view"

/** `void` over the wire is encoded as `null` (JSON has no `undefined`). */
const VoidSchema = z.null()

// ── Providers ────────────────────────────────────────────────────────────────

export const GetProvidersParamsSchema = z.undefined()
export const GetProvidersResultSchema = z.array(ProviderViewSchema)

/**
 * Add/Update provider inputs carry only NON-secret config + the list of secret
 * field *names* the provider expects. `.strict()` rejects any smuggled `secrets`
 * key — raw values arrive only via `setProviderSecret`.
 */
const ProviderMutationInputSchema = z.object({
  name: z.string().min(1),
  sdkProvider: SdkProviderSchema,
  config: z.record(z.string(), z.string()),
  secretFieldNames: z.array(z.string()),
  models: z.array(z.string()),
}).strict()

export const AddProviderParamsSchema = ProviderMutationInputSchema
export const AddProviderResultSchema = ProviderViewSchema

export const UpdateProviderParamsSchema = z.object({
  id: ProviderIdSchema,
  input: ProviderMutationInputSchema,
}).strict()
export const UpdateProviderResultSchema = ProviderViewSchema

export const DeleteProviderParamsSchema = z.object({ id: ProviderIdSchema }).strict()
export const DeleteProviderResultSchema = VoidSchema

export const TestProviderParamsSchema = z.object({ id: ProviderIdSchema }).strict()
export const TestProviderResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().nonnegative(),
}).strict()

/**
 * The ONLY method whose params carry a raw secret value, and it is inbound
 * (webview→main) only — there is no corresponding main→webview result that
 * echoes it back (returns void).
 */
export const SetProviderSecretParamsSchema = z.object({
  providerId: ProviderIdSchema,
  field: z.string().min(1),
  value: z.string().min(1),
}).strict()
export const SetProviderSecretResultSchema = VoidSchema

// ── Aliases ──────────────────────────────────────────────────────────────────

export const GetAliasesParamsSchema = z.undefined()
export const GetAliasesResultSchema = z.array(ModelAliasSchema)

/** Add accepts a full alias mapping; the alias name is part of the body. */
export const AddAliasParamsSchema = ModelAliasSchema
export const AddAliasResultSchema = ModelAliasSchema

/** Update keys by alias name and carries the new mapping (sans the key). */
export const UpdateAliasParamsSchema = z.object({
  alias: AliasNameSchema,
  input: ModelAliasSchema.omit({ alias: true }),
}).strict()
export const UpdateAliasResultSchema = ModelAliasSchema

export const DeleteAliasParamsSchema = z.object({ alias: AliasNameSchema }).strict()
export const DeleteAliasResultSchema = VoidSchema

// ── Harnesses ─────────────────────────────────────────────────────────────────

export const GetHarnessesParamsSchema = z.undefined()
export const GetHarnessesResultSchema = z.array(HarnessDefinitionSchema)

/** Add accepts a full definition (user-defined harnesses arrive as JSON shapes). */
export const AddHarnessParamsSchema = HarnessDefinitionSchema
export const AddHarnessResultSchema = HarnessDefinitionSchema

export const UpdateHarnessParamsSchema = z.object({
  id: HarnessIdSchema,
  input: HarnessDefinitionSchema.omit({ id: true }),
}).strict()
export const UpdateHarnessResultSchema = HarnessDefinitionSchema

export const DeleteHarnessParamsSchema = z.object({ id: HarnessIdSchema }).strict()
export const DeleteHarnessResultSchema = VoidSchema

export const LaunchHarnessParamsSchema = z.object({
  id: HarnessIdSchema,
  alias: AliasNameSchema.optional(),
}).strict()
export const LaunchHarnessResultSchema = SessionSchema

// ── Sessions & proxy ──────────────────────────────────────────────────────────

export const GetSessionsParamsSchema = z.object({
  harnessId: HarnessIdSchema.optional(),
  alias: AliasNameSchema.optional(),
}).strict().optional()
export const GetSessionsResultSchema = z.array(SessionSchema)

export const GetProxyStatusParamsSchema = z.undefined()
export const GetProxyStatusResultSchema = z.object({
  running: z.boolean(),
  port: z.number().int().nonnegative(),
}).strict()

// ── The method → {params, result} schema map ──────────────────────────────────

/** Maps each contract method to its on-the-wire param + result zod schemas. */
export const IpcMethodSchemas = {
  getProviders: { params: GetProvidersParamsSchema, result: GetProvidersResultSchema },
  addProvider: { params: AddProviderParamsSchema, result: AddProviderResultSchema },
  updateProvider: { params: UpdateProviderParamsSchema, result: UpdateProviderResultSchema },
  deleteProvider: { params: DeleteProviderParamsSchema, result: DeleteProviderResultSchema },
  testProvider: { params: TestProviderParamsSchema, result: TestProviderResultSchema },
  setProviderSecret: { params: SetProviderSecretParamsSchema, result: SetProviderSecretResultSchema },
  getAliases: { params: GetAliasesParamsSchema, result: GetAliasesResultSchema },
  addAlias: { params: AddAliasParamsSchema, result: AddAliasResultSchema },
  updateAlias: { params: UpdateAliasParamsSchema, result: UpdateAliasResultSchema },
  deleteAlias: { params: DeleteAliasParamsSchema, result: DeleteAliasResultSchema },
  getHarnesses: { params: GetHarnessesParamsSchema, result: GetHarnessesResultSchema },
  addHarness: { params: AddHarnessParamsSchema, result: AddHarnessResultSchema },
  updateHarness: { params: UpdateHarnessParamsSchema, result: UpdateHarnessResultSchema },
  deleteHarness: { params: DeleteHarnessParamsSchema, result: DeleteHarnessResultSchema },
  launchHarness: { params: LaunchHarnessParamsSchema, result: LaunchHarnessResultSchema },
  getSessions: { params: GetSessionsParamsSchema, result: GetSessionsResultSchema },
  getProxyStatus: { params: GetProxyStatusParamsSchema, result: GetProxyStatusResultSchema },
} as const

/** The set of valid method names, derived from the schema map. */
export type IpcMethodName = keyof typeof IpcMethodSchemas

/**
 * The typed contract: method name → its params + result TypeScript types,
 * inferred from the schemas above (single source of truth).
 */
export type IpcMethods = {
  readonly [K in IpcMethodName]: {
    readonly params: z.infer<(typeof IpcMethodSchemas)[K]["params"]>
    readonly result: z.infer<(typeof IpcMethodSchemas)[K]["result"]>
  }
}
```
> `void` results are encoded as `null` (`VoidSchema = z.null()`) because JSON carries no `undefined`. Params that are "nothing" use `z.undefined()`; the client passes `undefined` and the server validates the same. `IpcMethods` is derived from `IpcMethodSchemas` so the type and the runtime validation can never drift.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(ipc): add per-method param/result schemas + IpcMethods map [ipc-02]`.

---

### Task ipc-03: `ClientTransport` + `createIpcClient`

**Files:**
- Create: `packages/ipc/src/errors.ts`, `packages/ipc/src/client.ts`
- Test: `packages/ipc/src/client.test.ts`

The client validates **params** against the method's `ParamsSchema` before `send`, then validates the **response** against the `ResultSchema`, returning `Result<result, IpcError>` — never throwing. The transport is injected, so tests use an in-memory fake.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createIpcClient } from "./client"
import type { ClientTransport } from "./client"
import { ProviderViewSchema } from "./provider-view"

const sampleView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: {},
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
}

/** Records calls and replays a scripted reply (or throws) per method. */
const fakeTransport = (
  reply: (method: string, payload: unknown) => Promise<unknown>,
): ClientTransport & { calls: ReadonlyArray<{ method: string; payload: unknown }> } => {
  const calls: Array<{ method: string; payload: unknown }> = []
  return {
    calls,
    send: async (method, payload) => {
      calls.push({ method, payload })
      return reply(method, payload)
    },
  }
}

describe("createIpcClient", () => {
  it("validates params, sends, and returns Ok(result) when the response is valid", async () => {
    const transport = fakeTransport(async () => [sampleView])
    const client = createIpcClient(transport)
    const r = await client.getProviders(undefined)
    expect(r).toEqual({ ok: true, value: [ProviderViewSchema.parse(sampleView)] })
    expect(transport.calls).toEqual([{ method: "getProviders", payload: undefined }])
  })

  it("returns a validation-failed error and never sends when params are invalid", async () => {
    const transport = fakeTransport(async () => null)
    const client = createIpcClient(transport)
    // Missing required fields on addProvider params.
    const r = await client.addProvider({ name: "" } as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("validation-failed")
    expect(transport.calls).toEqual([]) // short-circuited before send
  })

  it("returns a validation-failed error when the response fails the result schema", async () => {
    const transport = fakeTransport(async () => ({ not: "an array" }))
    const client = createIpcClient(transport)
    const r = await client.getProviders(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("validation-failed")
  })

  it("returns a transport-failed error when the transport rejects", async () => {
    const transport = fakeTransport(async () => { throw new Error("bridge down") })
    const client = createIpcClient(transport)
    const r = await client.getProxyStatus(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("transport-failed")
      expect(r.error.detail).toContain("bridge down")
    }
  })

  it("encodes a void result (null) as an Ok carrying null", async () => {
    const transport = fakeTransport(async () => null)
    const client = createIpcClient(transport)
    const r = await client.deleteProvider({ id: "p_openai" })
    expect(r).toEqual({ ok: true, value: null })
  })

  it("passes the secret value through on setProviderSecret and returns Ok(null)", async () => {
    const transport = fakeTransport(async () => null)
    const client = createIpcClient(transport)
    const r = await client.setProviderSecret({ providerId: "p_openai", field: "apiKey", value: "sk-secret" })
    expect(r).toEqual({ ok: true, value: null })
    expect(transport.calls[0]).toEqual({
      method: "setProviderSecret",
      payload: { providerId: "p_openai", field: "apiKey", value: "sk-secret" },
    })
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `errors.ts`**

```typescript
/** Typed, message-safe IPC failures (no stack traces, no secrets). */
export type IpcError =
  | { readonly kind: "validation-failed"; readonly detail: string }
  | { readonly kind: "transport-failed"; readonly detail: string }
  | { readonly kind: "handler-failed"; readonly detail: string }
```

- [ ] **Step 4: Implement `client.ts`**

```typescript
import type { z } from "zod"
import { type Result, ok, err } from "@launchkit/utils"
import type { IpcError } from "./errors"
import { IpcMethodSchemas, type IpcMethodName, type IpcMethods } from "./methods"

/** The injected message bus the client sends over (Electrobun in production). */
export interface ClientTransport {
  send(method: string, payload: unknown): Promise<unknown>
}

const toDetail = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** A typed client method: validated params in, `Result<result, IpcError>` out. */
type ClientMethod<K extends IpcMethodName> = (
  params: IpcMethods[K]["params"],
) => Promise<Result<IpcMethods[K]["result"], IpcError>>

export type IpcClient = { readonly [K in IpcMethodName]: ClientMethod<K> }

const callMethod = async <K extends IpcMethodName>(
  transport: ClientTransport,
  method: K,
  params: IpcMethods[K]["params"],
): Promise<Result<IpcMethods[K]["result"], IpcError>> => {
  const schemas = IpcMethodSchemas[method]

  // 1. Validate params on the way out (defense even though TS-typed).
  const parsedParams = (schemas.params as z.ZodTypeAny).safeParse(params)
  if (!parsedParams.success) {
    return err({ kind: "validation-failed", detail: parsedParams.error.message })
  }

  // 2. Send over the injected transport; transport faults are values, not throws.
  let raw: unknown
  try {
    raw = await transport.send(method, parsedParams.data)
  } catch (e) {
    return err({ kind: "transport-failed", detail: toDetail(e) })
  }

  // 3. Validate the response against the result schema before trusting it.
  const parsedResult = (schemas.result as z.ZodTypeAny).safeParse(raw)
  if (!parsedResult.success) {
    return err({ kind: "validation-failed", detail: parsedResult.error.message })
  }
  return ok(parsedResult.data as IpcMethods[K]["result"])
}

/**
 * Build a typed IPC client over an injected transport. Each generated method
 * validates its params, sends, then validates the response — returning a
 * `Result` and never throwing.
 */
export const createIpcClient = (transport: ClientTransport): IpcClient => {
  const names = Object.keys(IpcMethodSchemas) as IpcMethodName[]
  const client = {} as Record<IpcMethodName, ClientMethod<IpcMethodName>>
  for (const name of names) {
    client[name] = ((params: IpcMethods[typeof name]["params"]) =>
      callMethod(transport, name, params)) as ClientMethod<IpcMethodName>
  }
  return client as IpcClient
}
```
> The per-method closures are built from `IpcMethodSchemas` so the runtime surface always matches the typed `IpcClient`. The `as z.ZodTypeAny` casts are confined to the dispatch core (the public method signatures stay fully typed via `IpcMethods`).

- [ ] **Step 5: Run, expect GREEN.** **Step 6: Commit** `feat(ipc): add ClientTransport + createIpcClient [ipc-03]`.

---

### Task ipc-04: `ServerTransport` + `createIpcServer`

**Files:**
- Create: `packages/ipc/src/server.ts`
- Test: `packages/ipc/src/server.test.ts`

On each request the server looks up the method, **validates the incoming payload** with its `ParamsSchema` (rejecting `validation-failed` on bad input — never reaching the handler), calls the handler, then validates/serializes the result with its `ResultSchema`. Unknown methods and handler throws become typed errors. Transport is injected; tests use a fake bus + fake handlers.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createIpcServer } from "./server"
import type { ServerTransport } from "./server"
import type { IpcHandlers } from "./server"

const sampleView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai" as const,
  config: {},
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
}

/** A controllable transport: capture the handler, drive requests by hand. */
const fakeServerTransport = (): ServerTransport & {
  dispatch(method: string, payload: unknown): Promise<unknown>
} => {
  let handler: ((method: string, payload: unknown) => Promise<unknown>) | undefined
  return {
    onRequest: (h) => { handler = h },
    dispatch: (method, payload) => {
      if (!handler) throw new Error("no handler registered")
      return handler(method, payload)
    },
  }
}

describe("createIpcServer", () => {
  it("validates the payload then dispatches to the matching handler and returns its result", async () => {
    const transport = fakeServerTransport()
    const handlers: Pick<IpcHandlers, "getProviders"> = {
      getProviders: async () => [sampleView],
    }
    createIpcServer(handlers as IpcHandlers, transport)
    const out = await transport.dispatch("getProviders", undefined)
    expect(out).toEqual([sampleView])
  })

  it("rejects an unknown method with a handler-failed error and never invents a result", async () => {
    const transport = fakeServerTransport()
    createIpcServer({} as IpcHandlers, transport)
    await expect(transport.dispatch("noSuchMethod", {})).rejects.toThrow(/handler-failed/)
  })

  it("rejects an invalid payload before the handler runs", async () => {
    const transport = fakeServerTransport()
    let handlerRan = false
    const handlers: Pick<IpcHandlers, "addProvider"> = {
      addProvider: async () => { handlerRan = true; return sampleView },
    }
    createIpcServer(handlers as IpcHandlers, transport)
    await expect(transport.dispatch("addProvider", { name: "" })).rejects.toThrow(/validation-failed/)
    expect(handlerRan).toBe(false)
  })

  it("rejects with handler-failed when the handler throws", async () => {
    const transport = fakeServerTransport()
    const handlers: Pick<IpcHandlers, "getProxyStatus"> = {
      getProxyStatus: async () => { throw new Error("proxy probe failed") },
    }
    createIpcServer(handlers as IpcHandlers, transport)
    await expect(transport.dispatch("getProxyStatus", undefined)).rejects.toThrow(/proxy probe failed/)
  })

  it("rejects with validation-failed when a handler returns a result that fails its schema", async () => {
    const transport = fakeServerTransport()
    const handlers: Pick<IpcHandlers, "getProxyStatus"> = {
      // Missing `port` — invalid result shape.
      getProxyStatus: async () => ({ running: true } as never),
    }
    createIpcServer(handlers as IpcHandlers, transport)
    await expect(transport.dispatch("getProxyStatus", undefined)).rejects.toThrow(/validation-failed/)
  })

  it("consumes the raw secret on setProviderSecret and serializes a void (null) result", async () => {
    const transport = fakeServerTransport()
    let received: { providerId: string; field: string; value: string } | undefined
    const handlers: Pick<IpcHandlers, "setProviderSecret"> = {
      setProviderSecret: async (params) => { received = params; return null },
    }
    createIpcServer(handlers as IpcHandlers, transport)
    const out = await transport.dispatch("setProviderSecret", {
      providerId: "p_openai",
      field: "apiKey",
      value: "sk-secret",
    })
    expect(out).toBeNull() // void encoded as null; no value echoed back
    expect(received).toEqual({ providerId: "p_openai", field: "apiKey", value: "sk-secret" })
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `server.ts`**

```typescript
import type { z } from "zod"
import type { IpcError } from "./errors"
import { IpcMethodSchemas, type IpcMethodName, type IpcMethods } from "./methods"

/** The injected inbound bus the server listens on (Electrobun in production). */
export interface ServerTransport {
  onRequest(handler: (method: string, payload: unknown) => Promise<unknown>): void
}

/** One handler per method: typed params in, typed result out. */
export type IpcHandlers = {
  readonly [K in IpcMethodName]: (params: IpcMethods[K]["params"]) => Promise<IpcMethods[K]["result"]>
}

const isMethodName = (method: string): method is IpcMethodName =>
  Object.prototype.hasOwnProperty.call(IpcMethodSchemas, method)

/**
 * A surfaced IPC failure. Carries the typed `IpcError`; its message is
 * `"<kind>: <detail>"` so transports/tests can pattern-match on the kind
 * without leaking stack traces or secrets.
 */
export class IpcRequestError extends Error {
  readonly ipcError: IpcError
  constructor(ipcError: IpcError) {
    super(`${ipcError.kind}: ${ipcError.detail}`)
    this.name = "IpcRequestError"
    this.ipcError = ipcError
  }
}

const toDetail = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Wire a set of handlers to an injected inbound transport. Each request is
 * (1) routed to a known method, (2) param-validated before dispatch, (3) run,
 * (4) result-validated before reply. Any failure is thrown as an
 * `IpcRequestError` carrying a typed `IpcError` for the transport to serialize.
 */
export const createIpcServer = (handlers: IpcHandlers, transport: ServerTransport): void => {
  transport.onRequest(async (method: string, payload: unknown): Promise<unknown> => {
    // 1. Route — unknown methods are rejected, never guessed.
    if (!isMethodName(method)) {
      throw new IpcRequestError({ kind: "handler-failed", detail: `unknown method: ${method}` })
    }
    const schemas = IpcMethodSchemas[method]

    // 2. Validate the incoming payload BEFORE the handler can observe it.
    const parsedParams = (schemas.params as z.ZodTypeAny).safeParse(payload)
    if (!parsedParams.success) {
      throw new IpcRequestError({ kind: "validation-failed", detail: parsedParams.error.message })
    }

    // 3. Dispatch — handler faults become typed handler-failed errors.
    let result: unknown
    try {
      const handler = handlers[method] as (p: unknown) => Promise<unknown>
      result = await handler(parsedParams.data)
    } catch (e) {
      throw new IpcRequestError({ kind: "handler-failed", detail: toDetail(e) })
    }

    // 4. Validate/serialize the result before it leaves the main process.
    const parsedResult = (schemas.result as z.ZodTypeAny).safeParse(result)
    if (!parsedResult.success) {
      throw new IpcRequestError({ kind: "validation-failed", detail: parsedResult.error.message })
    }
    return parsedResult.data
  })
}
```
> The server validates **inbound params first** — a malformed payload (or a smuggled secret on a non-secret method, rejected by `.strict()`) can never reach a handler. `setProviderSecret` is the lone method whose validated params include a raw value; its `ResultSchema` is `null`, so nothing is echoed back. `IpcRequestError.ipcError` keeps the failure typed; the desktop transport adapter serializes `.ipcError` so the client's result-schema validation/transport layer surfaces it as an `IpcError`.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(ipc): add ServerTransport + createIpcServer [ipc-04]`.

---

### Task ipc-05: In-memory transport pair, barrel + package CLAUDE.md

**Files:**
- Create: `packages/ipc/src/fake-transport.ts`, `packages/ipc/src/index.ts`, `packages/ipc/CLAUDE.md`
- Test: `packages/ipc/src/fake-transport.test.ts`, `packages/ipc/src/index.test.ts`

A directly-wired in-memory `ClientTransport`/`ServerTransport` pair lets tests (and desktop integration tests) exercise the full client↔server round-trip with no Electrobun. Then the barrel publishes the package surface.

- [ ] **Step 1: Write the failing tests**

`fake-transport.test.ts` — a full round-trip through both helpers:
```typescript
import { describe, it, expect } from "bun:test"
import { createMemoryTransportPair } from "./fake-transport"
import { createIpcClient } from "./client"
import { createIpcServer, type IpcHandlers } from "./server"

const sampleView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai" as const,
  config: {},
  secretFields: { apiKey: { isSet: false } },
  models: ["gpt-4o"],
}

describe("createMemoryTransportPair", () => {
  it("round-trips a client call through a real server and handler", async () => {
    const { client: clientTransport, server: serverTransport } = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProviders"> = { getProviders: async () => [sampleView] }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.getProviders(undefined)
    expect(r).toEqual({ ok: true, value: [sampleView] })
  })

  it("surfaces a server-side validation failure as a transport-failed Result on the client", async () => {
    const { client: clientTransport, server: serverTransport } = createMemoryTransportPair()
    let handlerRan = false
    const handlers: Pick<IpcHandlers, "addProvider"> = {
      addProvider: async () => { handlerRan = true; return sampleView },
    }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.addProvider({ name: "" } as never)
    // Client-side param validation short-circuits first; handler never runs.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("validation-failed")
    expect(handlerRan).toBe(false)
  })

  it("propagates a handler throw to the client as a transport-failed error", async () => {
    const { client: clientTransport, server: serverTransport } = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProxyStatus"> = {
      getProxyStatus: async () => { throw new Error("boom") },
    }
    createIpcServer(handlers as IpcHandlers, serverTransport)
    const client = createIpcClient(clientTransport)

    const r = await client.getProxyStatus(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("transport-failed")
      expect(r.error.detail).toContain("handler-failed")
    }
  })

  it("throws when no server is wired to the pair", async () => {
    const { client: clientTransport } = createMemoryTransportPair()
    const client = createIpcClient(clientTransport)
    const r = await client.getProxyStatus(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("transport-failed")
  })
})
```

`index.test.ts` — the public surface:
```typescript
import { describe, it, expect } from "bun:test"
import * as ipc from "./index"

describe("@launchkit/ipc barrel", () => {
  it("exports the client/server factories, transport fakes, and schemas", () => {
    for (const name of [
      "ProviderViewSchema", "IpcMethodSchemas",
      "createIpcClient", "createIpcServer", "createMemoryTransportPair",
      "IpcRequestError",
    ]) {
      expect(ipc).toHaveProperty(name)
    }
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `fake-transport.ts`**

```typescript
import type { ClientTransport } from "./client"
import type { ServerTransport } from "./server"

/** A linked client+server transport sharing one in-process channel. */
export interface MemoryTransportPair {
  readonly client: ClientTransport
  readonly server: ServerTransport
}

/**
 * Build a directly-wired transport pair for tests: the client's `send`
 * invokes the server's registered request handler in-process (no Electrobun,
 * no serialization). A handler throw rejects the client's `send`, which the
 * client helper maps to a `transport-failed` Result.
 */
export const createMemoryTransportPair = (): MemoryTransportPair => {
  let handler: ((method: string, payload: unknown) => Promise<unknown>) | undefined

  const client: ClientTransport = {
    send: async (method, payload) => {
      if (!handler) throw new Error("transport-failed: no server registered")
      return handler(method, payload)
    },
  }

  const server: ServerTransport = {
    onRequest: (h) => { handler = h },
  }

  return { client, server }
}
```
> The fake intentionally lets `IpcRequestError` propagate from server→client; the client helper catches it and returns `err({ kind: "transport-failed", detail })`, mirroring how the real Electrobun bridge serializes a rejected request.

- [ ] **Step 4: Implement `index.ts`**

```typescript
export * from "./provider-view"
export * from "./methods"
export * from "./errors"
export * from "./client"
export * from "./server"
export * from "./fake-transport"
```

- [ ] **Step 5: Create `packages/ipc/CLAUDE.md`** from the `ipc` entry in `build-plan/03-claude-config/package-claude-md.md`:

```markdown
# @launchkit/ipc

**Responsibility:** the typed GUI↔main IPC contract + (de)serialization — a zod schema per method, validated on receive in both directions, plus `createIpcClient`/`createIpcServer` over an injected transport.

**Public API (barrel `src/index.ts`):** `ProviderView` + `ProviderViewSchema`; the per-method `XParamsSchema`/`XResultSchema` + `IpcMethodSchemas` map + `IpcMethods`/`IpcMethodName` types; `IpcError`; `ClientTransport` + `createIpcClient` (+ `IpcClient`); `ServerTransport` + `IpcHandlers` + `createIpcServer` + `IpcRequestError`; `createMemoryTransportPair` (test fake).

**Depends on:** `@launchkit/types`, `@launchkit/utils` (see build-plan/02-monorepo/boundaries.md).

**Effects owned:** none — the message bus is an injected `ClientTransport`/`ServerTransport`; production wires Electrobun in `apps/desktop`, tests use `createMemoryTransportPair`.

**Local rules:** every payload has a zod schema validated on receive (both directions); the contract mirrors the CRUD list in the architecture doc. **Secrets never travel main→webview:** providers leave as `ProviderView` (presence flags, no `ref`/value); `setProviderSecret` is the ONLY secret-bearing method and is inbound (webview→main) only. `void` results are encoded as `null`; errors are returned as `Result<T, IpcError>`, never thrown across the boundary.
```

- [ ] **Step 6: GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 7: Update PROGRESS.md, commit** `feat(ipc): add memory transport pair + public barrel + CLAUDE.md [ipc-05]`.

**End state:** `@launchkit/ipc` exports a fully-typed, schema-validated GUI↔main contract: a `ProviderView` that structurally cannot carry a secret, a params/result zod schema for every CRUD method, an `IpcMethods` map derived from those schemas, and `createIpcClient`/`createIpcServer` helpers that validate on receive in both directions and surface failures as `Result<T, IpcError>` — all over an injected transport, unit-tested end-to-end via `createMemoryTransportPair` with no Electrobun. `setProviderSecret` is the sole secret-bearing, inbound-only method. Consumers `import { createIpcClient, createIpcServer, type IpcMethods, ProviderViewSchema } from "@launchkit/ipc"`.
