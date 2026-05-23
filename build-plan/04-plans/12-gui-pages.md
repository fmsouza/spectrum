# GUI Pages (`apps/desktop/views/main`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React webview that runs inside the Electrobun window — a thin Electrobun-backed `ClientTransport`, an injected `IpcClient` context, the five data hooks (the only data-entry points), and the five pages (`Providers`, `Routing`, `Harnesses`, `Sessions`, `Dashboard`) composed from `@launchkit/ui`, plus the `app.tsx` router and a strict-CSP `index.html`. Pages and hooks are tested end-to-end with a **fake client** and no Electrobun runtime.

**Architecture:** Strict atomic design (`01-conventions/atomic-design.md`): **data enters only at the page level**, via IPC hooks that call an *injected* `IpcClient`; pages compose `@launchkit/ui` organisms/templates and pass data + handlers down. The single Electrobun-coupled file is `ipc-client.ts` (a `ClientTransport` adapter over `Electroview.rpc.request`); `createIpcClient` from `@launchkit/ipc` wraps it. An `IpcClientContext` injects the client so hooks/pages never import the transport directly — tests provide a fake client. **Security is structural:** the client only ever receives `ProviderView` (presence flags, never `ref`/value), and `setProviderSecret` is the only inbound write that carries a raw value; `index.html` ships a strict CSP. Long lists are virtualized/limited at the page level (`01-conventions/performance.md`).

**Tech Stack:** TypeScript (strict, `jsx: react-jsx`), `react` + `react-dom` (pinned, owned by `apps/desktop`), `electrobun` (pinned), `bun test` on happy-dom with `@testing-library/react` + `@testing-library/jest-dom` (registered by the root `test/setup.ts` preload from `phase0`). Depends on `@launchkit/ipc` + `@launchkit/ui` (+ `@launchkit/types`, `@launchkit/utils` transitively).

> Depends on: `phase0` (the `apps/desktop` Electrobun scaffold, `views/main/index.html`, `src/main.ts`), `ipc` (`done`), `ui` (`done`). Read `build-plan/01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, `atomic-design.md`, `security.md`, `performance.md`; `04-plans/04-ipc.md` (the `ClientTransport`/`createIpcClient`/`IpcClient`/`ProviderView`/method schemas you consume) and `10-ui.md` (the `@launchkit/ui` components you compose).
> **OUT OF SCOPE:** the `@launchkit/ui` components themselves (`10-ui.md`) and the main-process IPC *handlers* + window/tray (`11-desktop-shell.md`). This plan builds only the webview under `apps/desktop/views/main`.
> No new external deps beyond `electrobun` (owned by `apps/desktop`, pinned) and `react`/`react-dom` (already owned by `apps/desktop` from `phase0`). RED for every task is `bun test apps/desktop`. Component/hook tests import `{ describe, it, expect, mock }` from `"bun:test"` and `{ render, screen, fireEvent, waitFor }` from `"@testing-library/react"`; `afterEach(cleanup)` is global (preload) — no per-file teardown. Tests are named `it("does X when Y happens")`.

> **ELECTROBUN NOTE (confirmed against current docs at authoring time):** in the webview the API is `import { Electroview } from "electrobun/view"`, `Electroview.defineRPC<Schema>({ maxRequestTime, handlers: { requests, messages } })`, `new Electroview({ rpc })`, and a main-process request is invoked via `view.rpc.request.<method>(params): Promise<result>`. This is wrapped behind the thin `ClientTransport` adapter in `gui-pages-01` so every hook/page is tested with a **fake client** and no Electrobun runtime. Confirm the exact `electrobun/view` import path and `defineRPC` signature against the installed version at implementation time; if it diverges materially, adapt only `ipc-client.ts` (the rest of this plan is Electrobun-free) and report.

---

### Task gui-pages-01: Electrobun `ClientTransport` adapter + `IpcClientContext`/`useIpcClient` + fake-client test helper

**Files:**
- Create: `apps/desktop/views/main/ipc-client.ts`
- Create: `apps/desktop/views/main/IpcClientContext.tsx`
- Create: `apps/desktop/views/main/test/fake-client.ts`
- Test: `apps/desktop/views/main/IpcClientContext.test.tsx`, `apps/desktop/views/main/test/fake-client.test.ts`

`ipc-client.ts` is the **only** Electrobun-coupled file: a `ClientTransport` whose `send(method, payload)` calls `electroview.rpc.request[method](payload)`, then `createIpcClient(transport)` from `@launchkit/ipc`. `IpcClientContext` injects an `IpcClient` so hooks/pages receive it; `useIpcClient()` reads it and throws if a provider is missing (programmer error). `createFakeIpcClient` builds a fully-typed in-memory `IpcClient` from per-method stubs for tests.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/test/fake-client.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import { createFakeIpcClient } from "./fake-client"

describe("createFakeIpcClient", () => {
  it("returns the scripted Ok value when a stubbed method is called", async () => {
    const client = createFakeIpcClient({
      getProxyStatus: async () => ({ ok: true, value: { running: true, port: 4000 } }),
    })
    const r = await client.getProxyStatus(undefined)
    expect(r).toEqual({ ok: true, value: { running: true, port: 4000 } })
  })

  it("records the params each call was made with when invoked", async () => {
    const client = createFakeIpcClient({
      setProviderSecret: async () => ({ ok: true, value: null }),
    })
    await client.setProviderSecret({ providerId: "p_openai", field: "apiKey", value: "sk-x" })
    expect(client.calls.setProviderSecret).toEqual([
      { providerId: "p_openai", field: "apiKey", value: "sk-x" },
    ])
  })

  it("returns a handler-failed Result when an unstubbed method is called", async () => {
    const client = createFakeIpcClient({})
    const r = await client.getProviders(undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("handler-failed")
  })
})
```

`apps/desktop/views/main/IpcClientContext.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen } from "@testing-library/react"
import { IpcClientProvider, useIpcClient } from "./IpcClientContext"
import { createFakeIpcClient } from "./test/fake-client"

const Probe = (): JSX.Element => {
  const client = useIpcClient()
  return <span>{typeof client.getProviders === "function" ? "has-client" : "no-client"}</span>
}

describe("useIpcClient", () => {
  it("returns the injected client when inside a provider", () => {
    const client = createFakeIpcClient({})
    render(
      <IpcClientProvider client={client}>
        <Probe />
      </IpcClientProvider>,
    )
    expect(screen.getByText("has-client")).toBeInTheDocument()
  })

  it("throws a descriptive error when used outside a provider", () => {
    expect(() => render(<Probe />)).toThrow(/IpcClientProvider/)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (module not found).

- [ ] **Step 3: Implement `ipc-client.ts`** (the only Electrobun-coupled file)

```typescript
import { Electroview } from "electrobun/view"
import { type ClientTransport, createIpcClient, type IpcClient } from "@launchkit/ipc"

/** Re-export the webview's client type so pages/hooks import it from one place. */
export type { IpcClient } from "@launchkit/ipc"

/**
 * The Electrobun RPC surface this adapter calls. We only ever invoke `request`
 * (main→webview handlers return values); `send` (fire-and-forget) is unused here.
 */
type ElectrobunRpc = {
  readonly request: Readonly<Record<string, (payload: unknown) => Promise<unknown>>>
}

/**
 * The single Electrobun-coupled file. Wraps `Electroview.rpc.request.<method>`
 * in the transport-agnostic `ClientTransport` interface so everything above it
 * (hooks, pages) is tested with a fake client and no Electrobun runtime.
 */
export const createElectrobunTransport = (rpc: ElectrobunRpc): ClientTransport => ({
  send: (method, payload) => {
    const call = rpc.request[method]
    if (call === undefined) {
      return Promise.reject(new Error(`unknown ipc method: ${method}`))
    }
    return call(payload)
  },
})

/**
 * Construct the Electroview, expose its RPC as a `ClientTransport`, and build
 * the typed `IpcClient` over it. Called once by `app.tsx` for the real client.
 * The empty handler set is intentional — the webview answers no requests from
 * the main process; it only initiates them.
 */
export const createRealIpcClient = (): IpcClient => {
  const rpc = Electroview.defineRPC<Record<string, never>>({
    maxRequestTime: 5000,
    handlers: { requests: {}, messages: {} },
  })
  const view = new Electroview({ rpc })
  const transport = createElectrobunTransport(view.rpc as ElectrobunRpc)
  return createIpcClient(transport)
}
```
> `createElectrobunTransport` is exported separately from `createRealIpcClient` so a thin integration test can exercise the adapter against a *fake* `rpc` object (asserting `send("getProviders", undefined)` calls `rpc.request.getProviders(undefined)`) without booting Electrobun. `createRealIpcClient` is the production wiring `app.tsx` calls; it is never unit-tested (it touches the Electrobun runtime).

- [ ] **Step 4: Implement `IpcClientContext.tsx`**

```tsx
import { createContext, type ReactNode, useContext } from "react"
import type { IpcClient } from "@launchkit/ipc"

const IpcClientContext = createContext<IpcClient | null>(null)

export type IpcClientProviderProps = {
  readonly client: IpcClient
  readonly children: ReactNode
}

/** Injects the IPC client so pages/hooks consume it via `useIpcClient()`. */
export const IpcClientProvider = ({ client, children }: IpcClientProviderProps): JSX.Element => (
  <IpcClientContext.Provider value={client}>{children}</IpcClientContext.Provider>
)

/**
 * Read the injected `IpcClient`. Throws if no provider is mounted — a missing
 * provider is a programmer error, not an expected runtime failure (so we throw
 * here rather than returning a `Result`).
 */
export const useIpcClient = (): IpcClient => {
  const client = useContext(IpcClientContext)
  if (client === null) {
    throw new Error("useIpcClient must be used within an IpcClientProvider")
  }
  return client
}
```

- [ ] **Step 5: Implement `test/fake-client.ts`** (the test seam every hook/page test uses)

```typescript
import type { IpcClient } from "@launchkit/ipc"

/**
 * A partial set of method stubs — each returns the same `Result` the real
 * client would. Methods left unstubbed default to a `handler-failed` Result so
 * a test that forgot to stub a call fails loudly rather than hanging.
 */
export type FakeClientStubs = Partial<{
  readonly [K in keyof IpcClient]: IpcClient[K]
}>

/** A fake client plus a per-method record of the params it was called with. */
export type FakeIpcClient = IpcClient & {
  readonly calls: { [K in keyof IpcClient]: Array<Parameters<IpcClient[K]>[0]> }
}

const METHOD_NAMES = [
  "getProviders", "addProvider", "updateProvider", "deleteProvider", "testProvider", "setProviderSecret",
  "getAliases", "addAlias", "updateAlias", "deleteAlias",
  "getHarnesses", "addHarness", "updateHarness", "deleteHarness", "launchHarness",
  "getSessions", "getProxyStatus",
] as const satisfies ReadonlyArray<keyof IpcClient>

/**
 * Build a fully-typed in-memory `IpcClient` from partial stubs. Used by every
 * hook/page test — no Electrobun, no transport, deterministic. Records calls so
 * tests can assert (e.g.) that `setProviderSecret` received the typed value.
 */
export const createFakeIpcClient = (stubs: FakeClientStubs): FakeIpcClient => {
  const calls = {} as { [K in keyof IpcClient]: Array<Parameters<IpcClient[K]>[0]> }
  const client = {} as Record<keyof IpcClient, (params: unknown) => Promise<unknown>>

  for (const name of METHOD_NAMES) {
    calls[name] = []
    const stub = stubs[name] as ((params: unknown) => Promise<unknown>) | undefined
    client[name] = async (params: unknown): Promise<unknown> => {
      calls[name].push(params as never)
      if (stub === undefined) {
        return { ok: false, error: { kind: "handler-failed", detail: `unstubbed: ${name}` } }
      }
      return stub(params)
    }
  }

  return Object.assign(client as unknown as IpcClient, { calls }) as FakeIpcClient
}
```
> `createFakeIpcClient` returns an object whose method signatures match `IpcClient` exactly, so a page typed against `useIpcClient()` is exercised against the real contract types. The `calls` record makes the security assertions in `gui-pages-03` (the secret value reaches `setProviderSecret`) trivial to write.

- [ ] **Step 6: Run, expect GREEN.** **Step 7: Commit** `feat(gui-pages): add Electrobun transport adapter + IpcClientContext + fake client [gui-pages-01]`.

---

### Task gui-pages-02: The five data hooks over the injected client

**Files:**
- Create: `apps/desktop/views/main/hooks/useAsyncResource.ts`
- Create: `apps/desktop/views/main/hooks/useProviders.ts`, `useAliases.ts`, `useHarnesses.ts`, `useSessions.ts`, `useProxyStatus.ts`
- Create: `apps/desktop/views/main/hooks/index.ts`
- Test: `apps/desktop/views/main/hooks/useProviders.test.tsx`, `useSessions.test.tsx`, `useProxyStatus.test.tsx`

Each hook reads the injected client via `useIpcClient()`, calls the matching method, and returns `{ data, loading, error, refetch }`. They share one generic `useAsyncResource` engine (loading→data, error path, `refetch` re-calls). Hooks are the **only** data-entry point (`atomic-design.md`).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/hooks/useProviders.test.tsx`:
```tsx
import { describe, it, expect, mock } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { useProviders } from "./useProviders"
import type { ProviderView } from "@launchkit/ipc"

const view: ProviderView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: {},
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
} as unknown as ProviderView

const Probe = (): JSX.Element => {
  const { data, loading, error, refetch } = useProviders()
  return (
    <div>
      <span>{loading ? "loading" : "idle"}</span>
      <span>{error === undefined ? "no-error" : error.kind}</span>
      <span>{data === undefined ? "no-data" : `count:${data.length}`}</span>
      <button type="button" onClick={() => refetch()}>refetch</button>
    </div>
  )
}

describe("useProviders", () => {
  it("starts loading then exposes the data when the call resolves Ok", async () => {
    const client = createFakeIpcClient({ getProviders: async () => ({ ok: true, value: [view] }) })
    render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
    expect(screen.getByText("loading")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("count:1")).toBeInTheDocument())
    expect(screen.getByText("idle")).toBeInTheDocument()
    expect(screen.getByText("no-error")).toBeInTheDocument()
  })

  it("exposes the typed error and no data when the call resolves Err", async () => {
    const client = createFakeIpcClient({
      getProviders: async () => ({ ok: false, error: { kind: "transport-failed", detail: "down" } }),
    })
    render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
    await waitFor(() => expect(screen.getByText("transport-failed")).toBeInTheDocument())
    expect(screen.getByText("no-data")).toBeInTheDocument()
  })

  it("re-invokes the client when refetch is called", async () => {
    const getProviders = mock(async () => ({ ok: true as const, value: [view] }))
    const client = createFakeIpcClient({ getProviders })
    render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
    await waitFor(() => expect(screen.getByText("count:1")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "refetch" }))
    await waitFor(() => expect(getProviders).toHaveBeenCalledTimes(2))
  })
})
```

`apps/desktop/views/main/hooks/useSessions.test.tsx`:
```tsx
import { describe, it, expect, mock } from "bun:test"
import { render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { useSessions } from "./useSessions"

const Probe = ({ harnessId }: { readonly harnessId?: string }): JSX.Element => {
  const { data } = useSessions(harnessId === undefined ? undefined : { harnessId })
  return <span>{data === undefined ? "no-data" : `count:${data.length}`}</span>
}

describe("useSessions", () => {
  it("passes the filter through to getSessions when one is given", async () => {
    const getSessions = mock(async () => ({ ok: true as const, value: [] }))
    const client = createFakeIpcClient({ getSessions })
    render(<IpcClientProvider client={client}><Probe harnessId="claude" /></IpcClientProvider>)
    await waitFor(() => expect(getSessions).toHaveBeenCalled())
    expect(client.calls.getSessions[0]).toEqual({ harnessId: "claude" })
  })

  it("calls getSessions with undefined when no filter is given", async () => {
    const getSessions = mock(async () => ({ ok: true as const, value: [] }))
    const client = createFakeIpcClient({ getSessions })
    render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
    await waitFor(() => expect(getSessions).toHaveBeenCalled())
    expect(client.calls.getSessions[0]).toBeUndefined()
  })
})
```

`apps/desktop/views/main/hooks/useProxyStatus.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { useProxyStatus } from "./useProxyStatus"

const Probe = (): JSX.Element => {
  const { data } = useProxyStatus()
  return <span>{data === undefined ? "no-data" : data.running ? "running" : "stopped"}</span>
}

describe("useProxyStatus", () => {
  it("exposes the running status when the call resolves Ok", async () => {
    const client = createFakeIpcClient({
      getProxyStatus: async () => ({ ok: true, value: { running: true, port: 4000 } }),
    })
    render(<IpcClientProvider client={client}><Probe /></IpcClientProvider>)
    await waitFor(() => expect(screen.getByText("running")).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `hooks/useAsyncResource.ts`** (the shared engine)

```typescript
import { useCallback, useEffect, useRef, useState } from "react"
import type { Result } from "@launchkit/utils"
import type { IpcError } from "@launchkit/ipc"

/** The uniform shape every data hook returns. */
export type AsyncResource<T> = {
  readonly data: T | undefined
  readonly loading: boolean
  readonly error: IpcError | undefined
  readonly refetch: () => void
}

/**
 * Run an injected, `Result`-returning IPC call on mount and on `refetch`,
 * tracking loading/data/error. A mounted-ref guards against setting state after
 * unmount; a request counter discards stale responses when calls overlap.
 */
export const useAsyncResource = <T>(
  call: () => Promise<Result<T, IpcError>>,
): AsyncResource<T> => {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<IpcError | undefined>(undefined)

  const mounted = useRef<boolean>(true)
  const requestId = useRef<number>(0)

  const run = useCallback((): void => {
    const id = ++requestId.current
    setLoading(true)
    void call().then((result) => {
      if (!mounted.current || id !== requestId.current) return
      if (result.ok) {
        setData(result.value)
        setError(undefined)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
  }, [call])

  useEffect(() => {
    mounted.current = true
    run()
    return () => {
      mounted.current = false
    }
  }, [run])

  return { data, loading, error, refetch: run }
}
```
> `call` is wrapped in `useCallback` by each hook (closing over the client + params) so its identity is stable across renders; the request counter (`requestId`) makes overlapping `refetch`es safe — only the latest response is applied.

- [ ] **Step 4: Implement the five hooks**

`hooks/useProviders.ts`:
```typescript
import { useCallback } from "react"
import type { ProviderView } from "@launchkit/ipc"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/** Loads the secret-free provider views (the only provider shape the GUI sees). */
export const useProviders = (): AsyncResource<readonly ProviderView[]> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getProviders(undefined), [client])
  return useAsyncResource(call)
}
```

`hooks/useAliases.ts`:
```typescript
import { useCallback } from "react"
import type { ModelAlias } from "@launchkit/types"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

export const useAliases = (): AsyncResource<readonly ModelAlias[]> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getAliases(undefined), [client])
  return useAsyncResource(call)
}
```

`hooks/useHarnesses.ts`:
```typescript
import { useCallback } from "react"
import type { HarnessDefinition } from "@launchkit/types"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

export const useHarnesses = (): AsyncResource<readonly HarnessDefinition[]> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getHarnesses(undefined), [client])
  return useAsyncResource(call)
}
```

`hooks/useSessions.ts`:
```typescript
import { useCallback } from "react"
import type { Session } from "@launchkit/types"
import type { IpcMethods } from "@launchkit/ipc"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

/** The optional `getSessions` filter, taken straight from the IPC contract. */
export type SessionsFilter = IpcMethods["getSessions"]["params"]

export const useSessions = (filter?: SessionsFilter): AsyncResource<readonly Session[]> => {
  const client = useIpcClient()
  // Serialize the filter so the callback identity (and thus the effect) only
  // changes when the filter's *value* changes, not on every render.
  const filterKey = filter === undefined ? "" : JSON.stringify(filter)
  const call = useCallback(
    () => client.getSessions(filterKey === "" ? undefined : (JSON.parse(filterKey) as SessionsFilter)),
    [client, filterKey],
  )
  return useAsyncResource(call)
}
```

`hooks/useProxyStatus.ts`:
```typescript
import { useCallback } from "react"
import type { IpcMethods } from "@launchkit/ipc"
import { useIpcClient } from "../IpcClientContext"
import { type AsyncResource, useAsyncResource } from "./useAsyncResource"

export type ProxyStatus = IpcMethods["getProxyStatus"]["result"]

export const useProxyStatus = (): AsyncResource<ProxyStatus> => {
  const client = useIpcClient()
  const call = useCallback(() => client.getProxyStatus(undefined), [client])
  return useAsyncResource(call)
}
```

- [ ] **Step 5: Implement `hooks/index.ts`**

```typescript
export * from "./useAsyncResource"
export * from "./useProviders"
export * from "./useAliases"
export * from "./useHarnesses"
export * from "./useSessions"
export * from "./useProxyStatus"
```

- [ ] **Step 6: Run, expect GREEN.** **Step 7: Commit** `feat(gui-pages): add five data hooks over injected client [gui-pages-02]`.

---

### Task gui-pages-03: `ProvidersPage` (no-secret-values + setProviderSecret)

**Files:**
- Create: `apps/desktop/views/main/pages/ProvidersPage.tsx`
- Test: `apps/desktop/views/main/pages/ProvidersPage.test.tsx`

`ProvidersPage` uses `useProviders` and composes `@launchkit/ui`'s `ProviderList` (over the secret-free `ProviderView`s, mapped to its `ProviderDisplay` shape). It has an add-provider form (calling `addProvider` with non-secret config + secret field *names* only) and a **write-only** set-secret form calling `setProviderSecret`. **Security tests:** secret *values* are never rendered (only `secretFields[].isSet`); submitting the secret form calls the client's `setProviderSecret` with the typed value.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/pages/ProvidersPage.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { ProvidersPage } from "./ProvidersPage"
import type { ProviderView } from "@launchkit/ipc"

const view: ProviderView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
} as unknown as ProviderView

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({ getProviders: async () => ({ ok: true, value: [view] }), ...stubs })
  render(<IpcClientProvider client={client}><ProvidersPage /></IpcClientProvider>)
  return client
}

describe("ProvidersPage", () => {
  it("renders the provider name once the providers load", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument())
  })

  it("shows the secret field as set without rendering any secret value", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument())
    // Presence flag is shown…
    expect(screen.getByText(/apiKey/i)).toBeInTheDocument()
    expect(screen.getByText(/set/i)).toBeInTheDocument()
    // …and no secret value is anywhere in the DOM (the view never carries one).
    expect(document.body.textContent).not.toContain("sk-")
  })

  it("calls setProviderSecret with the typed value when the secret form is submitted", async () => {
    const client = renderPage({ setProviderSecret: async () => ({ ok: true, value: null }) })
    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Set secret for OpenAI" }))
    fireEvent.change(screen.getByLabelText("Secret field"), { target: { value: "apiKey" } })
    fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "sk-secret-123" } })
    fireEvent.click(screen.getByRole("button", { name: /save secret/i }))

    await waitFor(() => expect(client.calls.setProviderSecret.length).toBe(1))
    expect(client.calls.setProviderSecret[0]).toEqual({
      providerId: "p_openai",
      field: "apiKey",
      value: "sk-secret-123",
    })
  })

  it("never re-displays the secret value after submitting it", async () => {
    const client = renderPage({ setProviderSecret: async () => ({ ok: true, value: null }) })
    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Set secret for OpenAI" }))
    fireEvent.change(screen.getByLabelText("Secret field"), { target: { value: "apiKey" } })
    fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "sk-secret-123" } })
    fireEvent.click(screen.getByRole("button", { name: /save secret/i }))

    await waitFor(() => expect(client.calls.setProviderSecret.length).toBe(1))
    // The write-only form clears and the value is not echoed anywhere.
    expect(screen.queryByDisplayValue("sk-secret-123")).toBeNull()
  })

  it("submits the add-provider form with non-secret config and secret field names only", async () => {
    const client = renderPage({
      addProvider: async () => ({ ok: true, value: view }),
    })
    await waitFor(() => expect(screen.getByText("OpenAI")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add provider/i }))
    fireEvent.change(screen.getByLabelText("Provider name"), { target: { value: "Groq" } })
    fireEvent.change(screen.getByLabelText("SDK provider"), { target: { value: "groq" } })
    fireEvent.click(screen.getByRole("button", { name: /create provider/i }))

    await waitFor(() => expect(client.calls.addProvider.length).toBe(1))
    const params = client.calls.addProvider[0]
    expect(params).toMatchObject({ name: "Groq", sdkProvider: "groq" })
    // No raw secret ever travels with an add.
    expect(params).not.toHaveProperty("secrets")
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `pages/ProvidersPage.tsx`**

```tsx
import { useState } from "react"
import type { ProviderView } from "@launchkit/ipc"
import type { SdkProvider } from "@launchkit/types"
import {
  Button,
  EmptyState,
  FormField,
  ProviderList,
  Select,
  SettingsLayout,
  Spinner,
  TextInput,
} from "@launchkit/ui"
import type { ProviderDisplay } from "@launchkit/ui"
import { useIpcClient } from "../IpcClientContext"
import { useProviders } from "../hooks/useProviders"

const SDK_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama" },
] as const

const toDisplay = (view: ProviderView): ProviderDisplay => ({
  id: view.id,
  name: view.name,
  sdkProvider: view.sdkProvider,
})

export const ProvidersPage = (): JSX.Element => {
  const client = useIpcClient()
  const { data, loading, error, refetch } = useProviders()

  const [addOpen, setAddOpen] = useState<boolean>(false)
  const [newName, setNewName] = useState<string>("")
  const [newSdk, setNewSdk] = useState<SdkProvider>("openai")

  const [secretFor, setSecretFor] = useState<ProviderView | undefined>(undefined)
  const [secretField, setSecretField] = useState<string>("")
  const [secretValue, setSecretValue] = useState<string>("")

  const submitAdd = async (): Promise<void> => {
    if (newName.trim() === "") return
    const r = await client.addProvider({
      name: newName,
      sdkProvider: newSdk,
      config: {},
      secretFieldNames: ["apiKey"],
      models: [],
    })
    if (r.ok) {
      setAddOpen(false)
      setNewName("")
      refetch()
    }
  }

  const submitSecret = async (): Promise<void> => {
    if (secretFor === undefined || secretField.trim() === "" || secretValue.trim() === "") return
    const r = await client.setProviderSecret({
      providerId: secretFor.id,
      field: secretField,
      value: secretValue,
    })
    if (r.ok) {
      // Write-only: clear the value immediately; never echo it back.
      setSecretValue("")
      setSecretField("")
      setSecretFor(undefined)
      refetch()
    }
  }

  return (
    <SettingsLayout title="Providers">
      {loading ? <Spinner label="Loading providers" /> : null}
      {error !== undefined ? (
        <EmptyState title="Could not load providers" hint={`IPC error: ${error.kind}`} />
      ) : null}

      {data !== undefined ? (
        <>
          <ProviderList
            providers={data.map(toDisplay)}
            onAdd={() => setAddOpen(true)}
            onSelect={() => {}}
          />

          {/* Per-provider secret status (presence flags ONLY — never a value). */}
          <ul aria-label="Provider secrets">
            {data.map((provider) => (
              <li key={provider.id}>
                <span>{provider.name}</span>
                {Object.entries(provider.secretFields).map(([field, status]) => (
                  <span key={field}>{`${field}: ${status.isSet ? "set" : "unset"}`}</span>
                ))}
                <Button variant="secondary" onClick={() => setSecretFor(provider)}>
                  {`Set secret for ${provider.name}`}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {addOpen ? (
        <form
          aria-label="Add provider"
          onSubmit={(e) => {
            e.preventDefault()
            void submitAdd()
          }}
        >
          <FormField id="new-provider-name" label="Provider name">
            <TextInput id="new-provider-name" value={newName} onChange={setNewName} />
          </FormField>
          <FormField id="new-provider-sdk" label="SDK provider">
            <Select
              id="new-provider-sdk"
              value={newSdk}
              options={SDK_PROVIDER_OPTIONS}
              onChange={(v) => setNewSdk(v as SdkProvider)}
            />
          </FormField>
          <Button onClick={() => void submitAdd()}>Create provider</Button>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
        </form>
      ) : null}

      {secretFor !== undefined ? (
        <form
          aria-label={`Set secret for ${secretFor.name}`}
          onSubmit={(e) => {
            e.preventDefault()
            void submitSecret()
          }}
        >
          <FormField id="secret-field" label="Secret field">
            <TextInput id="secret-field" value={secretField} onChange={setSecretField} />
          </FormField>
          {/* type="password" + write-only: the value is sent, then cleared, never shown. */}
          <FormField id="secret-value" label="Secret value">
            <TextInput id="secret-value" type="password" value={secretValue} onChange={setSecretValue} />
          </FormField>
          <Button onClick={() => void submitSecret()}>Save secret</Button>
          <Button variant="secondary" onClick={() => setSecretFor(undefined)}>Cancel</Button>
        </form>
      ) : null}
    </SettingsLayout>
  )
}
```
> Security is structural here: `useProviders` only ever holds `ProviderView`s, whose `secretFields` are `{ isSet: boolean }` — there is *no* value to render. The secret form is write-only: `secretValue` is local state cleared on success and never read back from the client. `addProvider` carries `secretFieldNames` (names only), never `secrets`.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(gui-pages): add ProvidersPage with write-only secret form [gui-pages-03]`.

---

### Task gui-pages-04: `RoutingPage` (`AliasTable` + add/edit alias)

**Files:**
- Create: `apps/desktop/views/main/pages/RoutingPage.tsx`
- Test: `apps/desktop/views/main/pages/RoutingPage.test.tsx`

`RoutingPage` uses `useAliases` + `useProviders` (to build the `providerNames` map `AliasTable` needs) and composes `@launchkit/ui`'s `AliasTable`. It has an add/edit alias form calling `addAlias`/`updateAlias`; deleting a row calls `deleteAlias`. The provider-name map is derived from the secret-free `ProviderView`s.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/pages/RoutingPage.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { RoutingPage } from "./RoutingPage"
import type { ModelAlias } from "@launchkit/types"
import type { ProviderView } from "@launchkit/ipc"

const alias = { alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" } as unknown as ModelAlias
const view = {
  id: "p_openai", name: "OpenAI", sdkProvider: "openai",
  config: {}, secretFields: {}, models: ["gpt-4o-mini"],
} as unknown as ProviderView

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getAliases: async () => ({ ok: true, value: [alias] }),
    getProviders: async () => ({ ok: true, value: [view] }),
    ...stubs,
  })
  render(<IpcClientProvider client={client}><RoutingPage /></IpcClientProvider>)
  return client
}

describe("RoutingPage", () => {
  it("renders each alias with its resolved provider name when loaded", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())
    expect(screen.getByText("OpenAI")).toBeInTheDocument()
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument()
  })

  it("calls addAlias with the new mapping when the add form is submitted", async () => {
    const client = renderPage({ addAlias: async (p) => ({ ok: true, value: p }) })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add alias/i }))
    fireEvent.change(screen.getByLabelText("Alias name"), { target: { value: "smart" } })
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "p_openai" } })
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4o" } })
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }))

    await waitFor(() => expect(client.calls.addAlias.length).toBe(1))
    expect(client.calls.addAlias[0]).toEqual({ alias: "smart", providerId: "p_openai", providerModel: "gpt-4o" })
  })

  it("calls deleteAlias with the alias name when a row is deleted", async () => {
    const client = renderPage({ deleteAlias: async () => ({ ok: true, value: null }) })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(client.calls.deleteAlias.length).toBe(1))
    expect(client.calls.deleteAlias[0]).toEqual({ alias: "fast" })
  })

  it("seeds the edit form and calls updateAlias when an existing alias is edited", async () => {
    const client = renderPage({ updateAlias: async () => ({ ok: true, value: alias }) })
    await waitFor(() => expect(screen.getByText("fast")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText("Model")).toHaveValue("gpt-4o-mini")
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4o" } })
    fireEvent.click(screen.getByRole("button", { name: /save alias/i }))

    await waitFor(() => expect(client.calls.updateAlias.length).toBe(1))
    expect(client.calls.updateAlias[0]).toEqual({
      alias: "fast",
      input: { providerId: "p_openai", providerModel: "gpt-4o" },
    })
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `pages/RoutingPage.tsx`**

```tsx
import { useState } from "react"
import type { ModelAlias, ProviderId } from "@launchkit/types"
import {
  AliasTable,
  Button,
  EmptyState,
  FormField,
  Select,
  SettingsLayout,
  Spinner,
  TextInput,
} from "@launchkit/ui"
import { useIpcClient } from "../IpcClientContext"
import { useAliases } from "../hooks/useAliases"
import { useProviders } from "../hooks/useProviders"

type AliasDraft = {
  readonly alias: string
  readonly providerId: string
  readonly providerModel: string
  /** When editing, the original alias name being updated; absent for a new alias. */
  readonly editingOf: string | undefined
}

const EMPTY_DRAFT: AliasDraft = { alias: "", providerId: "", providerModel: "", editingOf: undefined }

export const RoutingPage = (): JSX.Element => {
  const client = useIpcClient()
  const aliases = useAliases()
  const providers = useProviders()

  const [draft, setDraft] = useState<AliasDraft | undefined>(undefined)

  const providerNames: Record<string, string> = {}
  for (const p of providers.data ?? []) providerNames[p.id] = p.name

  const providerOptions = (providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))

  const startEdit = (aliasName: string): void => {
    const found = (aliases.data ?? []).find((a) => a.alias === aliasName)
    if (found === undefined) return
    setDraft({
      alias: found.alias,
      providerId: found.providerId,
      providerModel: found.providerModel,
      editingOf: found.alias,
    })
  }

  const submitDraft = async (): Promise<void> => {
    if (draft === undefined) return
    if (draft.alias.trim() === "" || draft.providerId.trim() === "" || draft.providerModel.trim() === "") return

    const mapping = {
      alias: draft.alias,
      providerId: draft.providerId as ProviderId,
      providerModel: draft.providerModel,
    } as unknown as ModelAlias

    const r =
      draft.editingOf === undefined
        ? await client.addAlias(mapping)
        : await client.updateAlias({
            alias: draft.editingOf as ModelAlias["alias"],
            input: { providerId: mapping.providerId, providerModel: mapping.providerModel },
          })
    if (r.ok) {
      setDraft(undefined)
      aliases.refetch()
    }
  }

  const deleteAlias = async (aliasName: string): Promise<void> => {
    const r = await client.deleteAlias({ alias: aliasName as ModelAlias["alias"] })
    if (r.ok) aliases.refetch()
  }

  const update = <K extends keyof AliasDraft>(key: K, value: AliasDraft[K]): void =>
    setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), [key]: value }))

  return (
    <SettingsLayout title="Routing">
      {aliases.loading || providers.loading ? <Spinner label="Loading routing" /> : null}
      {aliases.error !== undefined ? (
        <EmptyState title="Could not load aliases" hint={`IPC error: ${aliases.error.kind}`} />
      ) : null}

      {aliases.data !== undefined ? (
        <>
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>Add alias</Button>
          <AliasTable
            aliases={aliases.data}
            providerNames={providerNames}
            onEdit={startEdit}
            onDelete={(a) => void deleteAlias(a)}
          />
        </>
      ) : null}

      {draft !== undefined ? (
        <form
          aria-label={draft.editingOf === undefined ? "Add alias" : `Edit alias ${draft.editingOf}`}
          onSubmit={(e) => {
            e.preventDefault()
            void submitDraft()
          }}
        >
          <FormField id="alias-name" label="Alias name">
            <TextInput
              id="alias-name"
              value={draft.alias}
              onChange={(v) => update("alias", v)}
              disabled={draft.editingOf !== undefined}
            />
          </FormField>
          <FormField id="alias-provider" label="Provider">
            <Select
              id="alias-provider"
              value={draft.providerId}
              options={providerOptions}
              onChange={(v) => update("providerId", v)}
            />
          </FormField>
          <FormField id="alias-model" label="Model">
            <TextInput id="alias-model" value={draft.providerModel} onChange={(v) => update("providerModel", v)} />
          </FormField>
          <Button onClick={() => void submitDraft()}>Save alias</Button>
          <Button variant="secondary" onClick={() => setDraft(undefined)}>Cancel</Button>
        </form>
      ) : null}
    </SettingsLayout>
  )
}
```
> The alias name is disabled while editing (it is the update key), so the `updateAlias` payload is `{ alias, input: { providerId, providerModel } }` — matching `UpdateAliasParamsSchema` (which `omit`s `alias` from the input). The provider-name map is built from the secret-free `ProviderView`s the page already holds; `AliasTable` does no lookup itself (`atomic-design.md`).

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(gui-pages): add RoutingPage with alias table + add/edit [gui-pages-04]`.

---

### Task gui-pages-05: `HarnessesPage` (built-in + custom; add via `HarnessForm`)

**Files:**
- Create: `apps/desktop/views/main/pages/HarnessesPage.tsx`
- Test: `apps/desktop/views/main/pages/HarnessesPage.test.tsx`

`HarnessesPage` uses `useHarnesses`, lists built-in and custom harnesses separately (partitioned by `builtIn`), and adds a custom harness via `@launchkit/ui`'s `HarnessForm` (mapping its `HarnessFormValues` to an `addHarness` payload). Built-in harnesses are read-only (no edit/delete).

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/pages/HarnessesPage.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { HarnessesPage } from "./HarnessesPage"
import type { HarnessDefinition } from "@launchkit/types"

const builtIn = {
  id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" }, defaultAlias: "default", builtIn: true,
} as unknown as HarnessDefinition
const custom = {
  id: "mytool", name: "My Tool", command: "mytool", apiFormat: "openai",
  envTemplate: { OPENAI_BASE_URL: "{{proxyUrl}}" }, defaultAlias: "fast", builtIn: false,
} as unknown as HarnessDefinition

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getHarnesses: async () => ({ ok: true, value: [builtIn, custom] }),
    ...stubs,
  })
  render(<IpcClientProvider client={client}><HarnessesPage /></IpcClientProvider>)
  return client
}

describe("HarnessesPage", () => {
  it("lists built-in and custom harnesses under separate sections when loaded", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())
    expect(screen.getByRole("heading", { name: /built-in/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /custom/i })).toBeInTheDocument()
    expect(screen.getByText("My Tool")).toBeInTheDocument()
  })

  it("calls addHarness with the form values when a custom harness is added", async () => {
    const client = renderPage({ addHarness: async (p) => ({ ok: true, value: p }) })
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /add custom harness/i }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Codex" } })
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "codex" } })
    fireEvent.change(screen.getByLabelText("Default alias"), { target: { value: "default" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(client.calls.addHarness.length).toBe(1))
    expect(client.calls.addHarness[0]).toMatchObject({
      name: "Codex",
      command: "codex",
      apiFormat: "anthropic",
      defaultAlias: "default",
      builtIn: false,
    })
  })

  it("does not offer a delete control for a built-in harness", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: "Delete Claude Code" })).toBeNull()
  })

  it("calls deleteHarness with the id when a custom harness is deleted", async () => {
    const client = renderPage({ deleteHarness: async () => ({ ok: true, value: null }) })
    await waitFor(() => expect(screen.getByText("My Tool")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Delete My Tool" }))
    await waitFor(() => expect(client.calls.deleteHarness.length).toBe(1))
    expect(client.calls.deleteHarness[0]).toEqual({ id: "mytool" })
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `pages/HarnessesPage.tsx`**

```tsx
import { useState } from "react"
import type { HarnessDefinition, HarnessId } from "@launchkit/types"
import {
  Badge,
  Button,
  EmptyState,
  HarnessForm,
  SettingsLayout,
  Spinner,
} from "@launchkit/ui"
import type { HarnessFormValues } from "@launchkit/ui"
import { useIpcClient } from "../IpcClientContext"
import { useHarnesses } from "../hooks/useHarnesses"

const NEW_HARNESS_DEFAULTS: HarnessFormValues = {
  name: "",
  command: "",
  apiFormat: "anthropic",
  defaultAlias: "default",
}

export const HarnessesPage = (): JSX.Element => {
  const client = useIpcClient()
  const { data, loading, error, refetch } = useHarnesses()
  const [addOpen, setAddOpen] = useState<boolean>(false)

  const builtIns = (data ?? []).filter((h) => h.builtIn)
  const customs = (data ?? []).filter((h) => !h.builtIn)

  const submitAdd = async (values: HarnessFormValues): Promise<void> => {
    // The page derives the non-user fields; the form only edits the user-facing ones.
    const definition = {
      id: values.command,
      name: values.name,
      command: values.command,
      apiFormat: values.apiFormat,
      envTemplate: {},
      defaultAlias: values.defaultAlias,
      builtIn: false,
    } as unknown as HarnessDefinition
    const r = await client.addHarness(definition)
    if (r.ok) {
      setAddOpen(false)
      refetch()
    }
  }

  const deleteHarness = async (id: string): Promise<void> => {
    const r = await client.deleteHarness({ id: id as HarnessId })
    if (r.ok) refetch()
  }

  return (
    <SettingsLayout title="Harnesses">
      {loading ? <Spinner label="Loading harnesses" /> : null}
      {error !== undefined ? (
        <EmptyState title="Could not load harnesses" hint={`IPC error: ${error.kind}`} />
      ) : null}

      {data !== undefined ? (
        <>
          <section aria-label="Built-in harnesses">
            <h2>Built-in</h2>
            <ul>
              {builtIns.map((h) => (
                <li key={h.id}>
                  <span>{h.name}</span>
                  <Badge tone="info">{h.apiFormat}</Badge>
                  <Badge tone="neutral">built-in</Badge>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Custom harnesses">
            <h2>Custom</h2>
            {customs.length === 0 ? (
              <EmptyState title="No custom harnesses yet" hint="Add one to launch your own tool." />
            ) : (
              <ul>
                {customs.map((h) => (
                  <li key={h.id}>
                    <span>{h.name}</span>
                    <Badge tone="info">{h.apiFormat}</Badge>
                    <Button variant="danger" onClick={() => void deleteHarness(h.id)}>
                      {`Delete ${h.name}`}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => setAddOpen(true)}>Add custom harness</Button>
          </section>
        </>
      ) : null}

      {addOpen ? (
        <HarnessForm
          initialValues={NEW_HARNESS_DEFAULTS}
          onSubmit={(v) => void submitAdd(v)}
          onCancel={() => setAddOpen(false)}
        />
      ) : null}
    </SettingsLayout>
  )
}
```
> Built-in harnesses render read-only (no delete control); only customs get a `Delete <name>` button → `deleteHarness({ id })`. `HarnessForm` (from `@launchkit/ui`) owns the field state and validates a non-empty name/command; the page maps its `HarnessFormValues` into the full `HarnessDefinition` the contract requires, forcing `builtIn: false`.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(gui-pages): add HarnessesPage listing built-in + custom [gui-pages-05]`.

---

### Task gui-pages-06: `SessionsPage` (filters + virtualization/limit)

**Files:**
- Create: `apps/desktop/views/main/pages/SessionsPage.tsx`
- Test: `apps/desktop/views/main/pages/SessionsPage.test.tsx`

`SessionsPage` uses `useSessions` (with a harness filter built from the loaded harness list) and composes `@launchkit/ui`'s `SessionTable`. Per `performance.md`, long histories are **limited at the page level** via `SessionTable`'s `maxVisible` prop and a "show more" control that raises the cap — the page never renders thousands of rows at once.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/pages/SessionsPage.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { SessionsPage } from "./SessionsPage"
import type { Session, HarnessDefinition } from "@launchkit/types"

const makeSession = (n: number): Session =>
  ({ id: `s_${n}`, harnessId: "claude", alias: "default", startedAt: `2026-05-23T10:00:${String(n).padStart(2, "0")}.000Z` } as unknown as Session)

const manySessions: readonly Session[] = Array.from({ length: 60 }, (_, i) => makeSession(i))
const harness = {
  id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic",
  envTemplate: {}, defaultAlias: "default", builtIn: true,
} as unknown as HarnessDefinition

const renderPage = (sessions: readonly Session[], stubs: Parameters<typeof createFakeIpcClient>[0] = {}) => {
  const client = createFakeIpcClient({
    getSessions: async () => ({ ok: true, value: sessions }),
    getHarnesses: async () => ({ ok: true, value: [harness] }),
    ...stubs,
  })
  render(<IpcClientProvider client={client}><SessionsPage /></IpcClientProvider>)
  return client
}

describe("SessionsPage", () => {
  it("renders only the capped number of rows for a long history", async () => {
    renderPage(manySessions)
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1))
    // 1 header + a bounded page window (50), not all 60.
    expect(screen.getAllByRole("row")).toHaveLength(51)
    expect(screen.getByText("+10 more")).toBeInTheDocument()
  })

  it("raises the cap and renders more rows when show more is clicked", async () => {
    renderPage(manySessions)
    await waitFor(() => expect(screen.getByText("+10 more")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /show more/i }))
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(61))
  })

  it("refetches sessions filtered by harness when a harness filter is chosen", async () => {
    const client = renderPage(manySessions)
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1))
    fireEvent.change(screen.getByLabelText("Filter by harness"), { target: { value: "claude" } })
    await waitFor(() =>
      expect(client.calls.getSessions.some((c) => c?.harnessId === "claude")).toBe(true),
    )
  })

  it("shows an empty state when there are no sessions", async () => {
    renderPage([])
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /no sessions/i })).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `pages/SessionsPage.tsx`**

```tsx
import { useState } from "react"
import type { HarnessId } from "@launchkit/types"
import {
  Button,
  EmptyState,
  FormField,
  Select,
  SessionTable,
  SettingsLayout,
  Spinner,
} from "@launchkit/ui"
import { useHarnesses } from "../hooks/useHarnesses"
import { useSessions } from "../hooks/useSessions"

/** Page-level window size: render at most this many rows, raised by "show more". */
const PAGE_SIZE = 50

export const SessionsPage = (): JSX.Element => {
  const harnesses = useHarnesses()
  const [harnessFilter, setHarnessFilter] = useState<string>("")
  const [visible, setVisible] = useState<number>(PAGE_SIZE)

  const sessions = useSessions(harnessFilter === "" ? undefined : { harnessId: harnessFilter as HarnessId })

  const harnessOptions = [
    { value: "", label: "All harnesses" },
    ...(harnesses.data ?? []).map((h) => ({ value: h.id, label: h.name })),
  ]

  const total = sessions.data?.length ?? 0

  return (
    <SettingsLayout title="Sessions">
      <FormField id="session-harness-filter" label="Filter by harness">
        <Select
          id="session-harness-filter"
          value={harnessFilter}
          options={harnessOptions}
          onChange={(v) => {
            setVisible(PAGE_SIZE)
            setHarnessFilter(v)
          }}
        />
      </FormField>

      {sessions.loading ? <Spinner label="Loading sessions" /> : null}
      {sessions.error !== undefined ? (
        <EmptyState title="Could not load sessions" hint={`IPC error: ${sessions.error.kind}`} />
      ) : null}

      {sessions.data !== undefined ? (
        <>
          {/* Page owns windowing per performance.md; SessionTable renders <= maxVisible rows. */}
          <SessionTable sessions={sessions.data} maxVisible={visible} />
          {total > visible ? (
            <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              {`Show more (${total - visible} hidden)`}
            </Button>
          ) : null}
        </>
      ) : null}
    </SettingsLayout>
  )
}
```
> `SessionTable` truncates to `maxVisible` and shows `+N more`; the page raises the cap in `PAGE_SIZE` steps rather than rendering the whole history, satisfying the "virtualize/limit long lists" budget in `performance.md`. Changing the harness filter resets the window and re-invokes `getSessions` with `{ harnessId }` (the hook serializes the filter so the effect re-runs only on a value change).

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(gui-pages): add SessionsPage with filter + page-level limiting [gui-pages-06]`.

---

### Task gui-pages-07: `DashboardPage` + `app.tsx` router + `index.html` (strict CSP)

**Files:**
- Create: `apps/desktop/views/main/pages/DashboardPage.tsx`
- Create: `apps/desktop/views/main/pages/index.ts`
- Create: `apps/desktop/views/main/app.tsx`
- Create/replace: `apps/desktop/views/main/index.html`
- Test: `apps/desktop/views/main/pages/DashboardPage.test.tsx`, `apps/desktop/views/main/app.test.tsx`

`DashboardPage` uses `useSessions` (active = no `endedAt`) + `useHarnesses` + `useProxyStatus`, showing active sessions and quick-launch cards that call `launchHarness`. `app.tsx` is a tiny hash/state router mounting the five pages inside `@launchkit/ui`'s `AppShell`, wrapped in `IpcClientProvider` with the real client. `index.html` ships a strict CSP `<meta>` (`default-src 'self'`; no remote scripts; no `unsafe-eval`) per `security.md`, loading the bundled `app.tsx`.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/views/main/pages/DashboardPage.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { DashboardPage } from "./DashboardPage"
import type { Session, HarnessDefinition } from "@launchkit/types"

const activeSession = { id: "s_1", harnessId: "claude", alias: "default", startedAt: "2026-05-23T10:00:00.000Z" } as unknown as Session
const harness = {
  id: "claude", name: "Claude Code", command: "claude", apiFormat: "anthropic",
  envTemplate: {}, defaultAlias: "default", builtIn: true,
} as unknown as HarnessDefinition

const renderPage = (stubs: Parameters<typeof createFakeIpcClient>[0]) => {
  const client = createFakeIpcClient({
    getSessions: async () => ({ ok: true, value: [activeSession] }),
    getHarnesses: async () => ({ ok: true, value: [harness] }),
    getProxyStatus: async () => ({ ok: true, value: { running: true, port: 4000 } }),
    ...stubs,
  })
  render(<IpcClientProvider client={client}><DashboardPage /></IpcClientProvider>)
  return client
}

describe("DashboardPage", () => {
  it("shows the proxy running status when the status loads", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByLabelText(/proxy running/i)).toBeInTheDocument())
  })

  it("renders the active session when one is running", async () => {
    renderPage({})
    await waitFor(() => expect(screen.getByText(/claude/i)).toBeInTheDocument())
  })

  it("calls launchHarness with the harness id when a quick-launch card is clicked", async () => {
    const client = renderPage({
      launchHarness: async () => ({ ok: true, value: activeSession }),
    })
    await waitFor(() => expect(screen.getByRole("button", { name: /launch claude code/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /launch claude code/i }))
    await waitFor(() => expect(client.calls.launchHarness.length).toBe(1))
    expect(client.calls.launchHarness[0]).toEqual({ id: "claude" })
  })
})
```

`apps/desktop/views/main/app.test.tsx`:
```tsx
import { describe, it, expect } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { App } from "./app"
import { createFakeIpcClient } from "./test/fake-client"

const fullClient = () =>
  createFakeIpcClient({
    getProviders: async () => ({ ok: true, value: [] }),
    getAliases: async () => ({ ok: true, value: [] }),
    getHarnesses: async () => ({ ok: true, value: [] }),
    getSessions: async () => ({ ok: true, value: [] }),
    getProxyStatus: async () => ({ ok: true, value: { running: false, port: 0 } }),
  })

describe("App", () => {
  it("renders the dashboard route by default", async () => {
    render(<App client={fullClient()} initialRoute="dashboard" />)
    await waitFor(() => expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument())
  })

  it("navigates to the providers page when its nav item is clicked", async () => {
    render(<App client={fullClient()} initialRoute="dashboard" />)
    fireEvent.click(screen.getByRole("link", { name: "Providers" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Providers" })).toBeInTheDocument())
  })

  it("renders the routing page when the initial route is routing", async () => {
    render(<App client={fullClient()} initialRoute="routing" />)
    await waitFor(() => expect(screen.getByRole("heading", { name: "Routing" })).toBeInTheDocument())
  })

  it("falls back to the dashboard when given an unknown initial route", async () => {
    render(<App client={fullClient()} initialRoute="bogus" />)
    await waitFor(() => expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run, expect RED.**

- [ ] **Step 3: Implement `pages/DashboardPage.tsx`**

```tsx
import {
  Button,
  EmptyState,
  SessionTable,
  SettingsLayout,
  Spinner,
  StatusDot,
} from "@launchkit/ui"
import type { HarnessId } from "@launchkit/types"
import { useIpcClient } from "../IpcClientContext"
import { useHarnesses } from "../hooks/useHarnesses"
import { useProxyStatus } from "../hooks/useProxyStatus"
import { useSessions } from "../hooks/useSessions"

export const DashboardPage = (): JSX.Element => {
  const client = useIpcClient()
  const proxy = useProxyStatus()
  const harnesses = useHarnesses()
  const sessions = useSessions()

  const active = (sessions.data ?? []).filter((s) => s.endedAt === undefined)

  const launch = async (id: string): Promise<void> => {
    const r = await client.launchHarness({ id: id as HarnessId })
    if (r.ok) sessions.refetch()
  }

  return (
    <SettingsLayout title="Dashboard">
      <div aria-label="Proxy status">
        {proxy.data === undefined ? (
          <Spinner label="Checking proxy" />
        ) : (
          <StatusDot
            status={proxy.data.running ? "on" : "off"}
            label={proxy.data.running ? `Proxy running on port ${proxy.data.port}` : "Proxy stopped"}
          />
        )}
      </div>

      <section aria-label="Quick launch">
        <h2>Quick launch</h2>
        {harnesses.loading ? <Spinner label="Loading harnesses" /> : null}
        <ul>
          {(harnesses.data ?? []).map((h) => (
            <li key={h.id}>
              <span>{h.name}</span>
              <Button onClick={() => void launch(h.id)}>{`Launch ${h.name}`}</Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Active sessions">
        <h2>Active sessions</h2>
        {active.length === 0 ? (
          <EmptyState title="No active sessions" hint="Launch a harness to get started." />
        ) : (
          <SessionTable sessions={active} maxVisible={10} />
        )}
      </section>
    </SettingsLayout>
  )
}
```
> Active sessions are derived from `useSessions` (`endedAt === undefined`); quick-launch cards call `launchHarness({ id })` and refetch on success. The proxy `StatusDot` reuses the `@launchkit/ui` atom — no business logic in the page beyond deriving display.

- [ ] **Step 4: Implement `pages/index.ts`**

```typescript
export * from "./DashboardPage"
export * from "./ProvidersPage"
export * from "./RoutingPage"
export * from "./HarnessesPage"
export * from "./SessionsPage"
```

- [ ] **Step 5: Implement `app.tsx`** (tiny hash/state router; `App` takes an injected client so it is testable, `mount()` wires the real one)

```tsx
import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { AppShell } from "@launchkit/ui"
import type { IpcClient } from "@launchkit/ipc"
import { IpcClientProvider } from "./IpcClientContext"
import { createRealIpcClient } from "./ipc-client"
import {
  DashboardPage,
  HarnessesPage,
  ProvidersPage,
  RoutingPage,
  SessionsPage,
} from "./pages"

const ROUTES = ["dashboard", "providers", "routing", "harnesses", "sessions"] as const
export type Route = (typeof ROUTES)[number]

const NAV_ITEMS = [
  { route: "dashboard", label: "Dashboard" },
  { route: "providers", label: "Providers" },
  { route: "routing", label: "Routing" },
  { route: "harnesses", label: "Harnesses" },
  { route: "sessions", label: "Sessions" },
] as const

const isRoute = (value: string): value is Route => (ROUTES as readonly string[]).includes(value)

const normalizeRoute = (value: string): Route => (isRoute(value) ? value : "dashboard")

const PAGES: Readonly<Record<Route, () => JSX.Element>> = {
  dashboard: DashboardPage,
  providers: ProvidersPage,
  routing: RoutingPage,
  harnesses: HarnessesPage,
  sessions: SessionsPage,
}

export type AppProps = {
  readonly client: IpcClient
  readonly initialRoute?: string
}

export const App = ({ client, initialRoute = "dashboard" }: AppProps): JSX.Element => {
  const [route, setRoute] = useState<Route>(normalizeRoute(initialRoute))

  // Keep the URL hash in sync so reloads land on the same page (no remote nav).
  useEffect(() => {
    window.location.hash = `#${route}`
  }, [route])

  const Page = PAGES[route]

  return (
    <IpcClientProvider client={client}>
      <AppShell
        navItems={NAV_ITEMS}
        activeRoute={route}
        onNavigate={(next) => setRoute(normalizeRoute(next))}
      >
        <Page />
      </AppShell>
    </IpcClientProvider>
  )
}

/** Production entry: build the Electrobun-backed client and mount into #root. */
export const mount = (): void => {
  const container = document.getElementById("root")
  if (container === null) throw new Error("missing #root element")
  const startRoute = window.location.hash.replace(/^#/, "")
  createRoot(container).render(
    <StrictMode>
      <App client={createRealIpcClient()} initialRoute={startRoute} />
    </StrictMode>,
  )
}

// Auto-mount only in the real webview (a DOM with #root), never under the test
// runner (which imports `App` directly and renders it with a fake client).
if (typeof document !== "undefined" && document.getElementById("root") !== null) {
  mount()
}
```
> `App` is pure and injected — every test renders it with a fake client and an explicit `initialRoute`, so the router is exercised without Electrobun. `mount()` is the only place the real client is constructed; the auto-mount guard (`#root` present) keeps it from firing during `bun test` (happy-dom has no `#root` unless a test creates one).

- [ ] **Step 6: Implement `index.html`** (strict CSP per `security.md` — `default-src 'self'`, no remote scripts, no `unsafe-eval`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    />
    <title>LaunchKit</title>
  </head>
  <body>
    <div id="root"></div>
    <!-- Bundled locally by the Electrobun build; no remote scripts, no eval. -->
    <script type="module" src="./app.js"></script>
  </body>
</html>
```
> The CSP forbids remote script/connect origins (`'self'` only), bans `object`/`base`/`form-action`/framing, and omits `unsafe-eval` entirely — matching `security.md` "Webview hardening". `style-src` allows `'unsafe-inline'` only for styles (the in-house atomic CSS), never scripts. The bundler emits `app.js` from `app.tsx` next to this file; navigation stays on the app origin (external links are opened by the main process per `11-desktop-shell.md`, out of scope here).

- [ ] **Step 7: Run, expect GREEN + full gate** (`bun run typecheck && bun run lint && bun test`). **Step 8: Update PROGRESS.md, commit** `feat(gui-pages): add DashboardPage + app router + strict-CSP index.html [gui-pages-07]`.

**End state:** `apps/desktop/views/main` is a complete, Electrobun-free-to-test React webview: a single Electrobun-coupled `ipc-client.ts` (a `ClientTransport` over `Electroview.rpc.request` wrapped by `createIpcClient`), an `IpcClientProvider`/`useIpcClient()` that injects the typed `IpcClient`, five data hooks (`useProviders`/`useAliases`/`useHarnesses`/`useSessions`/`useProxyStatus`) each returning `{ data, loading, error, refetch }`, and five pages composed from `@launchkit/ui` — `Providers` (with a write-only `setProviderSecret` form and presence-flag-only secret display, never a value), `Routing`, `Harnesses`, `Sessions` (page-level limiting per `performance.md`), and `Dashboard` (quick-launch via `launchHarness`) — mounted by a tiny hash/state router in `app.tsx` inside `AppShell`, served from an `index.html` carrying a strict CSP (`default-src 'self'`, no remote scripts, no `unsafe-eval`). Data enters only at the page level via hooks over the injected client; every hook and page is unit-tested with `createFakeIpcClient` and no Electrobun runtime. Security is structural: the GUI only ever receives `ProviderView` (no secret value or ref crosses IPC), and `setProviderSecret` is the sole inbound secret-bearing write.
