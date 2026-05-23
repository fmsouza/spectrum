# tray-and-polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Phase-3 surface and final polish: the macOS system **tray** with a quick-launch submenu (`apps/desktop/src/gui/tray.ts`), a provider **connectivity tester** in `@launchkit/proxy` (`createProviderTester`), pure config **import/export** in `@launchkit/config`, and a final **end-to-end verification** task that proves the binary, CLI, proxy, and tray all hang together — then a wrap-up that greens the whole-repo gate and finalizes `PROGRESS.md`.

**Architecture:** Effects-at-the-edges, per `01-conventions/functional-style.md`. The whole tray is split into a **pure** menu-builder (`buildTrayMenu`, returning a serializable `TrayMenu` descriptor — fully unit-tested) and a **thin Electrobun seam** (`mountTray`) that turns that descriptor into a native tray and wires click handlers to the already-wired `AppContext` (reusing the exact launch+session path the IPC handlers use). The connectivity tester is a curried factory over the proxy's existing `ProviderFactory` + `LanguageModelGateway` seams plus an injected `Clock`, so latency is deterministic in tests and no real network is touched. Import/export are pure functions: `exportConfig` pretty-prints (secrets are already refs-only in `Config`, so nothing secret can leak), and `importConfig` validates untrusted input through `runMigrations` + `ConfigSchema` (reject-by-default). Security (`01-conventions/security.md`): exported config carries **no secret values** (asserted in a test), the connectivity probe sends a minimal 1-token prompt, and the tray builder is pure and cheap (`01-conventions/performance.md`).

**Tech Stack:** TypeScript (strict), `bun:test`, Electrobun (pinned, behind a thin seam), all relevant `@launchkit/*` packages.

> Depends on: `proxy` (`07-proxy.md` — `ProviderFactory`/`createProviderFactory`, `LanguageModelGateway`/`createScriptedGateway`, `ModelHandle`, `NormalizedRequest`, `StreamEvent`, `ProxyError`), `config` (`05-config.md` — `Config`/`ConfigSchema`, `runMigrations`, `defaultConfig`, `ConfigError`), `harnesses` (`08-harnesses.md` — `HarnessDefinition`, the registry), and `apps/desktop` (`11-desktop-shell.md` — `AppContext`, `createIpcHandlers`; the `testProvider` IPC handler delegates to `ctx.testProvider`). Read `01-conventions/typescript.md`, `functional-style.md`, `tdd.md`, `security.md`, `performance.md`, and `02-monorepo/boundaries.md` (rule 6: Electrobun lives only behind the seam here; the tray is the one file `11-desktop-shell.md` deliberately excluded).
> **Imports these locked contracts — do NOT redefine them:** `type Provider`, `type HarnessDefinition`, `type AliasName` from `@launchkit/types`; `type Config`, `ConfigSchema`, `runMigrations`, `type ConfigError` from `@launchkit/config`; `type ProviderFactory`, `type LanguageModelGateway`, `type ModelHandle`, `type NormalizedRequest`, `type ProxyError`, `createProviderFactory`, `createScriptedGateway` from `@launchkit/proxy`; `type Clock`, `createFixedClock`, `type Result`, `ok`, `err`, `isOk`, `isErr` from `@launchkit/utils`; `type AppContext` from `apps/desktop/src/composition`; `createIpcHandlers` from `apps/desktop/src/gui/ipc/handlers`.
> This plan adds `createProviderTester` to `@launchkit/proxy` and `exportConfig`/`importConfig` to `@launchkit/config` (extending existing packages — no new package), and creates `apps/desktop/src/gui/tray.ts` (owned solely here). It does not create a workspace package.

> **ELECTROBUN NOTE:** confirm Electrobun's **Tray** API against current Electrobun docs at implementation time (use the context7 MCP or fetch the docs). This plan pins the *intended wiring* and keeps every Electrobun-specific call behind a thin injected seam (`MountTrayDeps.createTray`) so the click-routing logic is unit-tested without a running tray. If the installed Tray API diverges, adapt **only** the thin seam (`realMountTrayDeps`) — `buildTrayMenu` and `mountTray`'s pure routing stay the same. The native call in `realMountTrayDeps` is smoke-tested only; if it cannot import the real Electrobun Tray symbols under `bun test`, guard the import as described in tray-polish-02 and mark that one step `blocked` rather than the whole task.

---

### Task tray-polish-01: `buildTrayMenu` pure function + `TrayMenu`/`TrayItem` types

**Files:**
- Create: `apps/desktop/src/gui/tray-menu.ts`
- Test: `apps/desktop/src/gui/tray-menu.test.ts`

`buildTrayMenu` is the **pure** core of the tray: given the harness list + whether the proxy is running, it returns a serializable `TrayMenu` descriptor (no Electrobun types, no functions). The seam (`mountTray`, tray-polish-02) turns this descriptor into a native menu and binds the click actions by item `kind`. Separating the descriptor from the native call is what makes the tray testable without a window (`functional-style.md`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { HarnessIdSchema, AliasNameSchema, type HarnessDefinition } from "@launchkit/types"
import { buildTrayMenu } from "./tray-menu"

const harness = (id: string, name: string): HarnessDefinition => ({
  id: HarnessIdSchema.parse(id),
  name,
  command: id,
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    ANTHROPIC_API_KEY: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
})

describe("buildTrayMenu", () => {
  it("puts a green status dot at the top when the proxy is running", () => {
    const menu = buildTrayMenu({ harnesses: [], proxyRunning: true })
    expect(menu.items[0]).toEqual({
      kind: "status",
      label: "Proxy: on",
      dot: { state: "on", color: "green" },
      enabled: false,
    })
  })

  it("puts a grey status dot at the top when the proxy is not running", () => {
    const menu = buildTrayMenu({ harnesses: [], proxyRunning: false })
    expect(menu.items[0]).toEqual({
      kind: "status",
      label: "Proxy: off",
      dot: { state: "off", color: "grey" },
      enabled: false,
    })
  })

  it("adds a Launch submenu with one item per harness carrying its id", () => {
    const menu = buildTrayMenu({
      harnesses: [harness("claude", "Claude Code"), harness("codex", "Codex")],
      proxyRunning: true,
    })
    const submenu = menu.items.find((i) => i.kind === "submenu")
    expect(submenu).toEqual({
      kind: "submenu",
      label: "Launch",
      items: [
        { kind: "launch", label: "Claude Code", harnessId: "claude" },
        { kind: "launch", label: "Codex", harnessId: "codex" },
      ],
    })
  })

  it("shows a disabled placeholder in the Launch submenu when there are no harnesses", () => {
    const menu = buildTrayMenu({ harnesses: [], proxyRunning: true })
    const submenu = menu.items.find((i) => i.kind === "submenu")
    expect(submenu).toEqual({
      kind: "submenu",
      label: "Launch",
      items: [{ kind: "disabled", label: "No harnesses configured" }],
    })
  })

  it("ends with Open LaunchKit then Quit, separated from the rest", () => {
    const menu = buildTrayMenu({ harnesses: [harness("claude", "Claude Code")], proxyRunning: true })
    const tail = menu.items.slice(-3)
    expect(tail).toEqual([
      { kind: "separator" },
      { kind: "open", label: "Open LaunchKit" },
      { kind: "quit", label: "Quit" },
    ])
  })

  it("produces a fully serializable descriptor with no functions in it", () => {
    const menu = buildTrayMenu({ harnesses: [harness("claude", "Claude Code")], proxyRunning: false })
    // A round-trip through JSON proves the descriptor carries no functions/handles (purity contract).
    expect(JSON.parse(JSON.stringify(menu))).toEqual(menu)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./tray-menu"`).

- [ ] **Step 3: Implement `tray-menu.ts`**

```typescript
import type { HarnessDefinition } from "@launchkit/types"

/** A single tray entry. A discriminated union so the seam binds the right action per `kind`. */
export type TrayItem =
  | { readonly kind: "status"; readonly label: string; readonly dot: TrayStatusDot; readonly enabled: false }
  | { readonly kind: "submenu"; readonly label: string; readonly items: readonly TrayItem[] }
  | { readonly kind: "launch"; readonly label: string; readonly harnessId: string }
  | { readonly kind: "disabled"; readonly label: string }
  | { readonly kind: "separator" }
  | { readonly kind: "open"; readonly label: string }
  | { readonly kind: "quit"; readonly label: string }

/** The status-dot descriptor: `on`/green when the proxy is up, `off`/grey when it is down. */
export type TrayStatusDot = {
  readonly state: "on" | "off"
  readonly color: "green" | "grey"
}

/** A serializable tray-menu descriptor — no Electrobun types, no functions. The seam renders it. */
export type TrayMenu = { readonly items: readonly TrayItem[] }

/** The inputs the pure builder needs: the harness list and whether the proxy is currently up. */
export interface BuildTrayMenuInput {
  readonly harnesses: readonly HarnessDefinition[]
  readonly proxyRunning: boolean
}

/**
 * PURE: build the tray-menu descriptor. A status item (green dot when `proxyRunning`, grey otherwise),
 * a "Launch" submenu with one item per harness (or a disabled placeholder when empty), then a
 * separator, "Open LaunchKit", and "Quit". Returns a plain serializable value — `mountTray`
 * (tray-polish-02) turns it into a native tray and binds clicks by `kind`. Cheap (`performance.md`):
 * one map over the harness list, no IO.
 */
export const buildTrayMenu = (input: BuildTrayMenuInput): TrayMenu => {
  const status: TrayItem = input.proxyRunning
    ? { kind: "status", label: "Proxy: on", dot: { state: "on", color: "green" }, enabled: false }
    : { kind: "status", label: "Proxy: off", dot: { state: "off", color: "grey" }, enabled: false }

  const launchItems: readonly TrayItem[] =
    input.harnesses.length === 0
      ? [{ kind: "disabled", label: "No harnesses configured" }]
      : input.harnesses.map(
          (h): TrayItem => ({ kind: "launch", label: h.name, harnessId: String(h.id) }),
        )

  return {
    items: [
      status,
      { kind: "submenu", label: "Launch", items: launchItems },
      { kind: "separator" },
      { kind: "open", label: "Open LaunchKit" },
      { kind: "quit", label: "Quit" },
    ],
  }
}
```

> The descriptor is deliberately function-free (the JSON round-trip test pins this): every action is reconstructed from the item `kind` + `harnessId` in the seam, so the pure layer never holds an Electrobun handle or a callback. `String(h.id)` flattens the branded `HarnessId` to a plain string for the serializable `harnessId` field.

- [ ] **Step 4: Run, expect GREEN.** **Step 5: Commit** `feat(desktop): add pure buildTrayMenu + TrayMenu/TrayItem types [tray-polish-01]`.

---

### Task tray-polish-02: `mountTray` Electrobun seam + click routing smoke test

**Files:**
- Create: `apps/desktop/src/gui/tray.ts`
- Test: `apps/desktop/src/gui/tray.test.ts`

`mountTray(ctx, actions)` builds the menu via `buildTrayMenu` (from `ctx.registry` + a live proxy-status check) and wires the descriptor to a native Electrobun tray behind an injected seam (`MountTrayDeps.createTray`). It routes clicks by item `kind`: `open` → `actions.openWindow()`, `quit` → `actions.quit()`, `launch` → launch the harness with its `defaultAlias` via **the same path the IPC handler uses** (`ctx.launch` + `ctx.sessions.create`). The seam is injected so the test asserts the routing with a **fake `ctx`** and a fake tray — no real Electrobun, no real launch.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test"
import { ok, err } from "@launchkit/utils"
import { HarnessIdSchema, AliasNameSchema, type HarnessDefinition, type Session } from "@launchkit/types"
import { mountTray } from "./tray"
import type { MountTrayDeps, TrayHandle } from "./tray"
import type { AppContext } from "../composition"
import type { TrayMenu } from "./tray-menu"

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

const sampleSession: Session = {
  id: HarnessIdSchema.parse("s_1") as unknown as Session["id"],
  harnessId: harness.id,
  alias: harness.defaultAlias,
  startedAt: "2026-05-23T10:00:00.000Z",
}

/**
 * `mountTray`'s click handler fires the async launch as a detached microtask (`void launchById(...)`)
 * because Electrobun click callbacks are synchronous `void`. The launch awaits a few promises
 * (`registry.list`, `config.load`), so a test must drain the microtask queue before asserting.
 */
const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/** A fake AppContext exposing only what mountTray touches, capturing launch + session calls. */
const makeCtx = (
  over: { harnesses?: readonly HarnessDefinition[]; proxyRunning?: boolean; launchOk?: boolean } = {},
): { ctx: AppContext; launchParams: unknown[]; sessionInputs: unknown[] } => {
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  const ctx = {
    registry: { list: async () => ok(over.harnesses ?? [harness]) },
    launch: (params: unknown) => {
      launchParams.push(params)
      return over.launchOk === false ? err({ kind: "spawn-failed", detail: "ENOENT" }) : ok({ pid: 42 })
    },
    sessions: {
      init: () => ok(undefined),
      create: (input: unknown) => {
        sessionInputs.push(input)
        return ok(sampleSession)
      },
      close: () => ok(sampleSession),
      query: () => ok([sampleSession]),
    },
    proxy: { isRunning: async () => over.proxyRunning ?? true, start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }) },
    proxyBaseUrl: "http://127.0.0.1:4000",
    genProxyKey: () => "k-test",
    config: {
      load: async () =>
        ok({ version: 2, providers: [], aliases: [], settings: { proxyPort: 4000, proxyHost: "127.0.0.1" } }),
      save: async () => ok(undefined),
    },
  } as unknown as AppContext
  return { ctx, launchParams, sessionInputs }
}

/**
 * A fake tray seam that records every rendered menu and captures the seam's `onClick` dispatcher,
 * so a test can fire a click by its clickId. No real Electrobun is touched.
 */
const captureTray = (): {
  deps: MountTrayDeps
  rendered: TrayMenu[]
  click: (clickId: string) => void
} => {
  const rendered: TrayMenu[] = []
  let onClick: ((clickId: string) => void) | undefined
  const deps: MountTrayDeps = {
    createTray: (menu: TrayMenu, handler: (clickId: string) => void): TrayHandle => {
      rendered.push(menu)
      onClick = handler
      return { setMenu: (m: TrayMenu) => rendered.push(m), destroy: () => {} }
    },
  }
  return {
    deps,
    rendered,
    click: (clickId: string): void => {
      if (onClick === undefined) throw new Error("createTray was not called before click()")
      onClick(clickId)
    },
  }
}

describe("mountTray", () => {
  it("renders the menu built from the registry and live proxy status when mounted", async () => {
    const { ctx } = makeCtx({ harnesses: [harness], proxyRunning: true })
    const { deps, rendered } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)

    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.items[0]).toMatchObject({ kind: "status", dot: { state: "on", color: "green" } })
    const submenu = rendered[0]?.items.find((i) => i.kind === "submenu")
    expect(submenu).toMatchObject({ kind: "submenu", items: [{ kind: "launch", harnessId: "claude" }] })
  })

  it("launches the harness with its defaultAlias and records a session when a Launch item is clicked", async () => {
    const { ctx, launchParams, sessionInputs } = makeCtx({ harnesses: [harness] })
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    // Same launch path as the IPC handler: ctx.launch(...) then ctx.sessions.create({ harnessId, alias }).
    expect(launchParams).toHaveLength(1)
    expect(launchParams[0]).toMatchObject({ harness, model: harness.defaultAlias })
    expect(sessionInputs).toEqual([{ harnessId: "claude", alias: "default" }])
  })

  it("invokes openWindow when the Open LaunchKit item is clicked", async () => {
    const { ctx } = makeCtx()
    const openWindow = mock(() => {})
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow, quit: () => {} }, deps)
    click("open")

    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it("invokes quit when the Quit item is clicked", async () => {
    const { ctx } = makeCtx()
    const quit = mock(() => {})
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit }, deps)
    click("quit")

    expect(quit).toHaveBeenCalledTimes(1)
  })

  it("does not record a session when the launcher fails to spawn", async () => {
    const { ctx, sessionInputs } = makeCtx({ harnesses: [harness], launchOk: false })
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    expect(sessionInputs).toEqual([]) // spawn failed → no session recorded
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./tray"`).

- [ ] **Step 3: Implement `tray.ts`** — the pure click-routing logic over the injected seam. `mountTray` reads the registry + live proxy status, builds the descriptor, mints a stable `clickId` per actionable item, and dispatches on it.

```typescript
import { isOk } from "@launchkit/utils"
import { buildTrayMenu, type TrayMenu } from "./tray-menu"
import type { AppContext } from "../composition"

/** The native tray handle the seam returns. `setMenu` re-renders; `destroy` tears down. */
export interface TrayHandle {
  setMenu(menu: TrayMenu): void
  destroy(): void
}

/**
 * The Electrobun Tray seam, injected so the routing logic is testable without a real tray.
 * `createTray` renders the descriptor and registers a single `onClick(clickId)` dispatcher; the
 * production default (`realMountTrayDeps`) wires the actual Electrobun Tray. The seam owns the
 * clickId↔item mapping convention: `"open"`, `"quit"`, and `"launch:<harnessId>"`.
 */
export interface MountTrayDeps {
  readonly createTray: (menu: TrayMenu, onClick: (clickId: string) => void) => TrayHandle
}

/** The two window-lifecycle effects the tray triggers (supplied by main.ts). */
export interface TrayActions {
  readonly openWindow: () => void
  readonly quit: () => void
}

/**
 * Build the tray menu from the live registry + proxy status, render it through the seam, and route
 * clicks: `open` → openWindow, `quit` → quit, `launch:<id>` → launch that harness with its
 * `defaultAlias` and record a session — reusing the SAME path as `createIpcHandlers.launchHarness`
 * (`ctx.launch(...)` then `ctx.sessions.create({ harnessId, alias })`). Thin by design: all the menu
 * shape lives in the pure `buildTrayMenu`; this only assembles + dispatches.
 */
export const mountTray = async (
  ctx: AppContext,
  actions: TrayActions,
  deps: MountTrayDeps = realMountTrayDeps,
): Promise<TrayHandle> => {
  const listed = await ctx.registry.list()
  const harnesses = isOk(listed) ? listed.value : []
  const proxyRunning = await ctx.proxy.isRunning(ctx.proxyBaseUrl)

  const menu = buildTrayMenu({ harnesses, proxyRunning })

  /** Launch a harness by id via the shared launch+session path (mirrors the IPC handler). */
  const launchById = async (harnessId: string): Promise<void> => {
    const list = await ctx.registry.list()
    if (!isOk(list)) return
    const harness = list.value.find((h) => String(h.id) === harnessId)
    if (harness === undefined) return

    const loaded = await ctx.config.load()
    if (!isOk(loaded)) return
    const { proxyHost, proxyPort } = loaded.value.settings
    const proxyUrl = `http://${proxyHost}:${proxyPort}`

    const launched = ctx.launch({
      harness,
      proxyUrl,
      proxyKey: ctx.genProxyKey(),
      model: harness.defaultAlias,
    })
    if (!isOk(launched)) return // spawn failed → do NOT record a session

    ctx.sessions.create({ harnessId: harness.id, alias: harness.defaultAlias })
  }

  const onClick = (clickId: string): void => {
    if (clickId === "open") {
      actions.openWindow()
      return
    }
    if (clickId === "quit") {
      actions.quit()
      return
    }
    if (clickId.startsWith("launch:")) {
      const harnessId = clickId.slice("launch:".length)
      void launchById(harnessId)
    }
  }

  return deps.createTray(menu, onClick)
}

/**
 * Production Electrobun wiring. CONFIRM the exact `Tray` constructor + menu/click API against the
 * installed Electrobun version (context7 / Electrobun docs) and adapt ONLY this block. It must
 * translate the `TrayMenu` descriptor into native menu items, assign each actionable item the
 * clickId convention (`"open"`, `"quit"`, `"launch:<harnessId>"`), and invoke `onClick(clickId)`.
 */
export const realMountTrayDeps: MountTrayDeps = {
  createTray: (_menu, _onClick) => {
    // Example shape — adapt to the installed Electrobun Tray API:
    //   import { Tray } from "electrobun/bun"
    //   const tray = new Tray({ ... })
    //   tray.setMenu(toNativeMenu(_menu, _onClick))  // map descriptor → native items + clickIds
    //   return { setMenu: (m) => tray.setMenu(toNativeMenu(m, _onClick)), destroy: () => tray.destroy() }
    throw new Error("mountTray: wire the real Electrobun Tray here (see ELECTROBUN NOTE)")
  },
}
```

> The `throw` in `realMountTrayDeps` is an **implementation marker**, not a plan placeholder: replace it with the confirmed Electrobun `Tray` calls (one block, behind this seam). It never runs under `bun test` because `mountTray`'s tests inject a fake `createTray`. The clickId convention (`"launch:<harnessId>"`) is the contract between the pure `buildTrayMenu` item (`{ kind: "launch", harnessId }`) and the dispatcher — the seam must emit exactly those ids. `launchById` re-lists the registry and loads config at click time (cheap, and avoids stale captures), then uses `ctx.launch` + `ctx.sessions.create` — byte-for-byte the same launch+session path as `createIpcHandlers.launchHarness` in `11-desktop-shell.md`. If importing Electrobun symbols at module top-level breaks `bun test`, keep that import dynamic/lazy inside `createTray` and mark only this step `blocked`; `buildTrayMenu` + `mountTray` routing stay green.

- [ ] **Step 4: Run, expect GREEN** — `bun test apps/desktop`. **Step 5: Wire the tray into `main.ts`** (one line in `apps/desktop/src/main.ts`, the file from `11-desktop-shell.md`): in GUI mode, after `openWindow(ctx)`, also `await mountTray(ctx, { openWindow: () => openWindow(ctx), quit: () => process.exit(0) })`. Concretely, extend `buildRealDeps`'s `openWindow` effect so it opens the window **and** mounts the tray:

```typescript
// in apps/desktop/src/main.ts (buildRealDeps), replace the openWindow effect:
import { mountTray } from "./gui/tray"
// ...
    openWindow:
      overrides.openWindow ??
      ((): void => {
        openWindow(ctx)
        void mountTray(ctx, { openWindow: () => openWindow(ctx), quit: () => process.exit(0) })
      }),
```

> This is the only edit to a file owned by another plan; it is additive (the tray is mounted alongside the window in GUI mode) and does not change `runApp`/`createIpcHandlers`/`createAppContext`. If `11-desktop-shell.md` is not yet `done`, defer this step (mark it `blocked: depends on desktop-shell-04`) — `buildTrayMenu`/`mountTray` are fully tested without it.

- [ ] **Step 6: Verify the app still builds** — run the documented Electrobun build (e.g. `bunx electrobun build` in `apps/desktop`). Expected: builds with no errors. If the Tray API diverged, adapt `realMountTrayDeps` only; if it cannot build, mark this step `blocked` and report (the tested logic is unaffected).

- [ ] **Step 7: Commit** `feat(desktop): add mountTray Electrobun seam + click routing, wire into GUI mode [tray-polish-02]`.

---

### Task tray-polish-03: `createProviderTester` (connectivity probe with injected Clock)

**Files:**
- Create: `packages/proxy/src/provider-tester.ts`
- Test: `packages/proxy/src/provider-tester.test.ts`

`createProviderTester(deps)` returns a `(provider, providerModel) => Promise<Result<{ ok, latencyMs }, ProxyError>>`. It calls `factory.getModel(provider, providerModel)`, then runs `gateway.stream(model, <minimal 1-token "ping">)` and drains it, measuring elapsed ms via an injected `Clock` (deterministic in tests). On success it returns `{ ok: true, latencyMs }`; if the factory fails (or the stream yields an `error` event) it returns `{ ok: false, latencyMs }`. SECURITY/PERFORMANCE (`security.md`/`performance.md`): the probe request is a single short user message with `maxTokens: 1` — the cheapest possible round-trip. The desktop `testProvider` IPC handler (`11-desktop-shell.md`) delegates to this via `ctx.testProvider`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { createFixedClock, ok, err, type Result } from "@launchkit/utils"
import type { Provider } from "@launchkit/types"
import { createProviderTester } from "./provider-tester"
import { createScriptedGateway } from "./gateway"
import type { ProviderFactory, ModelHandle } from "./providers/factory"
import type { LanguageModelGateway } from "./gateway"
import type { NormalizedRequest, ProxyError, StreamEvent } from "./types"

const provider = (over: Partial<Provider> = {}): Provider =>
  ({
    id: "p_openai",
    name: "OpenAI",
    sdkProvider: "openai",
    config: {},
    secrets: {},
    models: ["gpt-4o"],
    ...over,
  }) as Provider

/** A factory fake that returns a fixed model handle (or a preset error). */
const fakeFactory = (result: Result<ModelHandle, ProxyError> = ok({})): ProviderFactory => ({
  getModel: async () => result,
})

/** A clock that advances by `stepMs` on each now() call, so elapsed time is deterministic. */
const steppingClock = (startMs: number, stepMs: number) => {
  let t = startMs
  return {
    now: (): Date => {
      const at = new Date(t)
      t += stepMs
      return at
    },
  }
}

describe("createProviderTester", () => {
  it("returns ok with the measured latency when the model streams a finish event", async () => {
    const gateway = createScriptedGateway([
      { type: "text-delta", text: "p" },
      { type: "finish", finishReason: "stop" },
    ])
    const tester = createProviderTester({ factory: fakeFactory(), gateway, clock: steppingClock(1000, 25) })

    const result = await tester(provider(), "gpt-4o")

    expect(result).toEqual({ ok: true, value: { ok: true, latencyMs: 25 } })
  })

  it("measures latency as the elapsed time between the first and last clock reads", async () => {
    const gateway = createScriptedGateway([{ type: "finish", finishReason: "stop" }])
    // first now()=2000 (start), second now()=2120 (end) → 120ms
    const tester = createProviderTester({ factory: fakeFactory(), gateway, clock: steppingClock(2000, 120) })

    const result = await tester(provider(), "gpt-4o")

    expect(result.ok && result.value.latencyMs).toBe(120)
  })

  it("sends a minimal one-token ping request to the gateway", async () => {
    const captured: NormalizedRequest[] = []
    const capturingGateway: LanguageModelGateway = {
      async *stream(_model: ModelHandle, req: NormalizedRequest): AsyncIterable<StreamEvent> {
        captured.push(req)
        yield { type: "finish", finishReason: "stop" }
      },
    }
    const tester = createProviderTester({
      factory: fakeFactory(),
      gateway: capturingGateway,
      clock: createFixedClock(new Date("2026-05-23T00:00:00.000Z")),
    })

    await tester(provider(), "gpt-4o")

    expect(captured).toHaveLength(1)
    expect(captured[0]?.maxTokens).toBe(1)
    expect(captured[0]?.messages).toEqual([{ role: "user", content: "ping" }])
    expect(captured[0]?.stream).toBe(true)
  })

  it("returns ok:false when the provider factory fails to build a model", async () => {
    const gateway = createScriptedGateway([{ type: "finish", finishReason: "stop" }])
    const tester = createProviderTester({
      factory: fakeFactory(err({ kind: "provider-failed", detail: "secret apiKey unavailable" })),
      gateway,
      clock: steppingClock(0, 10),
    })

    const result = await tester(provider(), "gpt-4o")

    expect(result).toEqual({ ok: true, value: { ok: false, latencyMs: 0 } })
  })

  it("returns ok:false when the stream yields an error event", async () => {
    const gateway = createScriptedGateway([{ type: "error", detail: "401 from upstream" }])
    const tester = createProviderTester({ factory: fakeFactory(), gateway, clock: steppingClock(500, 40) })

    const result = await tester(provider(), "gpt-4o")

    expect(result.ok && result.value).toEqual({ ok: false, latencyMs: 40 })
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/proxy` → FAIL (`Cannot find module "./provider-tester"`).

- [ ] **Step 3: Implement `provider-tester.ts`**

```typescript
import { type Result, ok, isOk, type Clock } from "@launchkit/utils"
import type { Provider } from "@launchkit/types"
import type { ProviderFactory } from "./providers/factory"
import type { LanguageModelGateway } from "./gateway"
import type { NormalizedRequest, ProxyError } from "./types"

/** The outcome of a connectivity probe: whether it succeeded and how long it took. */
export type ProviderTestResult = { readonly ok: boolean; readonly latencyMs: number }

/** A connectivity probe: build the model, stream one cheap token, report ok + latency. */
export type ProviderTester = (
  provider: Provider,
  providerModel: string,
) => Promise<Result<ProviderTestResult, ProxyError>>

/** The minimal probe request: a single short user turn capped at one output token (security/perf). */
const pingRequest = (alias: string): NormalizedRequest => ({
  model: alias,
  messages: [{ role: "user", content: "ping" }],
  maxTokens: 1,
  stream: true,
})

/**
 * Build a provider connectivity tester over the proxy's existing seams. `getModel` resolves the
 * provider (secrets + lazy SDK + cache); `gateway.stream` runs the actual call. Latency is measured
 * with the injected `Clock` (deterministic in tests). A factory failure or a streamed `error` event
 * yields `{ ok: false }` (NOT an `Err` — the probe itself succeeded in determining the provider is
 * unreachable); the `Err<ProxyError>` channel is reserved for a probe that could not run at all.
 * PERFORMANCE/SECURITY: the request is one short message with `maxTokens: 1` — the cheapest probe.
 */
export const createProviderTester = (deps: {
  readonly factory: ProviderFactory
  readonly gateway: LanguageModelGateway
  readonly clock: Clock
}): ProviderTester => {
  return async (provider, providerModel) => {
    const start = deps.clock.now().getTime()

    const model = await deps.factory.getModel(provider, providerModel)
    if (!isOk(model)) {
      // Provider could not be built (bad config / missing secret) → unreachable, latency 0.
      return ok({ ok: false, latencyMs: 0 })
    }

    let streamErrored = false
    try {
      for await (const event of deps.gateway.stream(model.value, pingRequest(providerModel))) {
        if (event.type === "error") streamErrored = true
      }
    } catch {
      streamErrored = true
    }

    const latencyMs = deps.clock.now().getTime() - start
    return ok({ ok: !streamErrored, latencyMs })
  }
}
```

> The result is `Result<{ ok, latencyMs }, ProxyError>` to match the `AppContext.testProvider` contract in `11-desktop-shell.md`, but the common "provider unreachable" outcome is encoded as `ok({ ok: false, … })` — the *probe* ran fine, it just learned the provider is down. The factory-failed branch returns `latencyMs: 0` (no stream attempted) which is why the test uses a clock whose first read is the start; the second `now()` for the success path is what produces the deterministic non-zero latency. The probe request flows through the same `NormalizedRequest` shape the real gateway consumes, so wiring it to `createRealGateway` later needs no change here.

- [ ] **Step 4: GREEN.** **Step 5: Add to the proxy barrel** — in `packages/proxy/src/index.ts` (the barrel from `proxy-13`), re-export the tester:

```typescript
export type { ProviderTester, ProviderTestResult } from "./provider-tester"
export { createProviderTester } from "./provider-tester"
```

- [ ] **Step 6: Wire it into `createAppContext`** — in `apps/desktop/src/composition.ts` (from `11-desktop-shell.md`), replace the `testProvider` ok-stub with a real probe that looks up the provider by id from the loaded config, resolves its `providerModel` (use the provider's first known model, falling back to the provider id), and delegates to `createProviderTester`:

```typescript
// Add `createProviderTester` to the existing `@launchkit/proxy` import already at the top of
// composition.ts; add `err` and `createSystemClock` to the existing imports as noted below.
//
// in createAppContext, AFTER `factory` and `gateway` are built (they already exist there):
  const providerTester = createProviderTester({ factory, gateway, clock: deps.createSystemClock() })

  // `ProviderTestResult` is the type ALREADY declared locally in composition.ts (desktop-shell-02).
  const testProvider = async (
    providerId: string,
  ): Promise<Result<ProviderTestResult, unknown>> => {
    const loaded = await config.load()
    if (!loaded.ok) return loaded
    const provider = loaded.value.providers.find((p) => String(p.id) === providerId)
    if (provider === undefined) return err({ kind: "unknown-provider", providerId })
    const providerModel = provider.models[0] ?? providerId
    return providerTester(provider, providerModel)
  }
// ...then in the returned object, replace `testProvider: async () => ok(...)` with `testProvider,`
```

> Notes on imports/types to avoid collisions: (1) `createProviderTester` is the one **new** import — add it to the existing `import { ... } from "@launchkit/proxy"` line. (2) `createSystemClock` is already available as `deps.createSystemClock` (it is in `CreateAppContextDeps` and the real-deps bag), so reuse `deps.createSystemClock()` rather than importing it again. (3) `err` is added to the existing `@launchkit/utils` import (which already brings in `ok`/`Result`). (4) Do **NOT** also import `ProviderTestResult` from `@launchkit/proxy` — `composition.ts` already declares its own structurally-identical `ProviderTestResult` (`{ ok, latencyMs }`); the proxy's `ProviderTestResult` is structurally the same, so `providerTester`'s return assigns cleanly. This is the wiring the desktop-shell plan flagged as owned by tray-and-polish: `createIpcHandlers.testProvider` calls `ctx.testProvider(String(id))` and forwards the `{ ok, latencyMs }` value to the webview. If `11-desktop-shell.md` is not yet `done`, defer this step (`blocked: depends on desktop-shell-03`) — the tester itself is fully tested in this package.

- [ ] **Step 7: Commit** `feat(proxy): add createProviderTester connectivity probe + wire desktop testProvider [tray-polish-03]`.

---

### Task tray-polish-04: `exportConfig` / `importConfig` (pure round-trip)

**Files:**
- Create: `packages/config/src/transfer.ts`
- Test: `packages/config/src/transfer.test.ts`

`exportConfig(config)` pretty-prints a `Config` to JSON; because `Config` already models secrets as refs (never values — `05-config.md`/`security.md`), the export structurally cannot contain a secret value, which a test asserts directly. `importConfig(raw)` parses untrusted JSON-or-object input and validates it through `runMigrations` (which migrates **and** validates with `ConfigSchema`), rejecting invalid or foreign shapes with a typed `ConfigError`. Both are pure.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "bun:test"
import { exportConfig, importConfig } from "./transfer"
import { defaultConfig, CURRENT_CONFIG_VERSION, type Config } from "./schema"

const configWithProvider = (): Config =>
  ({
    version: CURRENT_CONFIG_VERSION,
    providers: [
      {
        id: "p_openai",
        name: "OpenAI",
        sdkProvider: "openai",
        config: { baseUrl: "https://api.openai.com/v1" },
        secrets: { apiKey: { ref: "kc_openai" } },
        models: ["gpt-4o"],
      },
    ],
    aliases: [{ alias: "fast", providerId: "p_openai", providerModel: "gpt-4o-mini" }],
    settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  }) as Config

describe("exportConfig", () => {
  it("produces 2-space pretty JSON that parses back to the same config", () => {
    const config = configWithProvider()
    const text = exportConfig(config)
    expect(text).toBe(JSON.stringify(config, null, 2))
    expect(JSON.parse(text)).toEqual(config)
  })

  it("includes secret references but never a secret value when exporting", () => {
    const text = exportConfig(configWithProvider())
    // The keychain REF is present (it is not a secret) ...
    expect(text).toContain("kc_openai")
    // ... but no raw secret value or value-shaped field is ever emitted (security.md).
    expect(text).not.toContain("sk-")
    expect(text).not.toContain('"value"')
  })
})

describe("importConfig", () => {
  it("accepts a valid current-version config object and returns it", () => {
    const config = configWithProvider()
    expect(importConfig(config)).toEqual({ ok: true, value: config })
  })

  it("accepts a valid config supplied as a JSON string", () => {
    const config = defaultConfig()
    expect(importConfig(JSON.stringify(config))).toEqual({ ok: true, value: config })
  })

  it("round-trips an exported config back through import to the original", () => {
    const config = configWithProvider()
    const reimported = importConfig(exportConfig(config))
    expect(reimported).toEqual({ ok: true, value: config })
  })

  it("migrates an older config on import by moving inline keys to empty secret refs", () => {
    const v1 = {
      version: 1,
      providers: [
        { id: "p_openai", name: "OpenAI", sdkProvider: "openai", apiKey: "sk-legacy", config: {}, models: ["gpt-4o"] },
      ],
      aliases: [],
    }
    const result = importConfig(v1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(CURRENT_CONFIG_VERSION)
    expect(result.value.providers[0]?.secrets).toEqual({})
  })

  it("returns a parse-failed error when given an invalid JSON string", () => {
    const result = importConfig("{ not json")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("parse-failed")
  })

  it("rejects a foreign object that is not a LaunchKit config", () => {
    const result = importConfig({ hello: "world", nested: { a: 1 } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("rejects a config whose provider carries a raw inline secret value", () => {
    const bad = {
      ...configWithProvider(),
      providers: [{ ...configWithProvider().providers[0], secrets: { apiKey: "sk-raw-inline" } }],
    }
    const result = importConfig(bad)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("migration-failed")
  })

  it("rejects a non-loopback proxyHost so an imported config can never bind a public interface", () => {
    const bad = { ...configWithProvider(), settings: { proxyPort: 4000, proxyHost: "0.0.0.0" } }
    const result = importConfig(bad)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test packages/config` → FAIL (`Cannot find module "./transfer"`).

- [ ] **Step 3: Implement `transfer.ts`**

```typescript
import { type Result, err } from "@launchkit/utils"
import { type Config } from "./schema"
import { runMigrations } from "./migrations"
import type { ConfigError } from "./errors"

/**
 * Serialize a `Config` to portable, human-readable JSON (2-space). PURE. Safe by construction:
 * `Config` models every secret as a `SecretRef` (a `{ ref }`), never a value — so an exported
 * document cannot contain a secret value (asserted in transfer.test.ts). The keychain *reference*
 * travels (it is not itself a secret); the value stays in the OS keychain.
 */
export const exportConfig = (config: Config): string => JSON.stringify(config, null, 2)

/**
 * Validate untrusted import input (a parsed object OR a JSON string) into a `Config`. PURE.
 * Reject-by-default (`security.md`): a JSON string is parsed first (`parse-failed` on syntax error),
 * then the value runs through `runMigrations`, which forward-migrates older versions AND validates
 * with `ConfigSchema` — so a foreign shape, an inline raw secret, a non-loopback host, or a
 * future/unknown version all fail as a typed `ConfigError` (`migration-failed`) rather than being
 * trusted. The same validation path the on-disk loader uses, so import can never admit a config the
 * loader would reject.
 */
export const importConfig = (raw: unknown): Result<Config, ConfigError> => {
  let value: unknown = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      return err({ kind: "parse-failed", detail })
    }
  }
  return runMigrations(value)
}
```

> Reusing `runMigrations` (rather than a fresh `ConfigSchema.safeParse`) is deliberate: import gets migration + validation for free and is guaranteed to admit exactly what the file store's `load` admits — one validation path, no drift. The inline-secret and non-loopback-host rejections fall straight out of `ConfigSchema` (`ProviderSchema` is `.strict()` with `SecretRef`-only secrets; `proxyHost` is the `127.0.0.1` literal), so those tests pass without any code in `importConfig` beyond the delegation. Both functions are pure — no effect, no IO — so they need no injected adapters and are trivially tested.

- [ ] **Step 4: GREEN.** **Step 5: Add to the config barrel** — in `packages/config/src/index.ts` (the barrel from `config-07`), re-export the transfer functions:

```typescript
export { exportConfig, importConfig } from "./transfer"
```

- [ ] **Step 6: Commit** `feat(config): add pure exportConfig/importConfig with validated round-trip [tray-polish-04]`.

---

### Task tray-polish-05: Final end-to-end / integration verification

**Files:**
- Create: `apps/desktop/src/e2e.integration.test.ts`
- Create: `apps/desktop/MANUAL-VERIFICATION.md`

The final automated check that the seams compose: build the real (no-IO-faked-where-needed) pieces and prove (1) the CLI `list` command runs against a temp config and prints harnesses, (2) a real loopback proxy answers `/health`, and (3) a tray menu builds from a registry + proxy status. The parts that genuinely need the **built desktop binary** (native window, native tray, click-through) are out of reach of `bun test` and are captured as an explicit **manual-verification checklist**. This task is **darwin-gated** where it touches macOS-only paths (the keychain is not exercised here — we keep the e2e keychain-free by using providers with empty `secrets`).

- [ ] **Step 1: Write the failing integration test**

```typescript
import { describe, it, expect, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCli } from "@launchkit/cli"
import { createMemoryWriter } from "@launchkit/cli"
import {
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  exportConfig,
  type Config,
} from "@launchkit/config"
import { createRegistry, createInMemoryHarnessFileSource, builtinHarnesses } from "@launchkit/harnesses"
import { startProxy, isProxyRunning, createRouter, createScriptedGateway } from "@launchkit/proxy"
import { buildTrayMenu } from "./gui/tray-menu"

const isDarwin = process.platform === "darwin"
const dirs: string[] = []
const freshConfig = async (): Promise<{ store: ReturnType<typeof createCachedConfigStore>; path: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "launchkit-e2e-"))
  dirs.push(dir)
  const path = join(dir, "config.json")
  const config: Config = {
    version: 2,
    providers: [{ id: "p1", name: "Local", sdkProvider: "openai", config: {}, secrets: {}, models: ["gpt-4o"] }],
    aliases: [{ alias: "default", providerId: "p1", providerModel: "gpt-4o" }],
    settings: { proxyPort: 0, proxyHost: "127.0.0.1" },
  } as Config
  await writeFile(path, exportConfig(config), "utf8")
  return { store: createCachedConfigStore(createFileConfigStore({ file: createFsConfigFile(path) })), path }
}

let stopProxy: (() => void) | undefined
afterEach(async () => {
  stopProxy?.()
  stopProxy = undefined
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

const describeDarwin = isDarwin ? describe : describe.skip

describeDarwin("LaunchKit end-to-end (darwin)", () => {
  it("runs the CLI `list harnesses` against a temp config and prints the built-in ids", async () => {
    const { store } = await freshConfig()
    const out = createMemoryWriter()
    const deps = {
      config: store,
      secrets: { set: async () => ({ ok: true, value: { ref: "kc" } }), get: async () => ({ ok: true, value: "x" }), delete: async () => ({ ok: true, value: undefined }), has: async () => false },
      sessions: { init: () => ({ ok: true, value: undefined }), create: () => ({ ok: true, value: {} }), close: () => ({ ok: true, value: {} }), query: () => ({ ok: true, value: [] }) },
      registry: { list: async () => ({ ok: true as const, value: builtinHarnesses }) },
      launch: () => ({ ok: true as const, value: { pid: 1 } }),
      proxy: { isRunning: async () => false, start: () => ({ hostname: "127.0.0.1", port: 0, stop: () => {} }) },
      genProxyKey: () => "k",
      out,
    } as never

    const result = await runCli(deps)(["list", "harnesses"])

    expect(result.ok).toBe(true)
    expect(out.lines.join("\n")).toContain("claude")
  })

  it("answers /health from a real loopback proxy on an ephemeral port", async () => {
    const { store } = await freshConfig()
    const loaded = await store.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const running = startProxy({
      host: "127.0.0.1",
      port: 0,
      proxyKey: "k",
      router: createRouter(loaded.value),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([{ type: "finish", finishReason: "stop" }]),
      listAliases: () => loaded.value.aliases.map((a) => String(a.alias)),
    })
    stopProxy = running.stop

    expect(running.hostname).toBe("127.0.0.1")
    expect(await isProxyRunning(`http://127.0.0.1:${running.port}`)).toBe(true)
  })

  it("builds a tray menu reflecting the configured harnesses and proxy status", async () => {
    const registry = createRegistry({ fileSource: createInMemoryHarnessFileSource([]) })
    const listed = await registry.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    const menu = buildTrayMenu({ harnesses: listed.value, proxyRunning: true })

    expect(menu.items[0]).toMatchObject({ kind: "status", dot: { state: "on", color: "green" } })
    const submenu = menu.items.find((i) => i.kind === "submenu")
    expect(submenu?.kind === "submenu" && submenu.items.map((i) => (i.kind === "launch" ? i.harnessId : i.kind))).toContain("claude")
  })
})
```

- [ ] **Step 2: Run, expect RED** — `bun test apps/desktop` → FAIL (`Cannot find module "./e2e.integration.test"` is your own file; the real RED is the assertions failing until the upstream pieces exist). On a non-darwin CI the suite is `describe.skip`ped — that is expected and is **not** a failure.

> This e2e leans only on already-`done` packages (`cli`, `config`, `harnesses`, `proxy`) plus the `buildTrayMenu` from tray-polish-01 — it does **not** require the Electrobun seam, so it runs fully under `bun test`. It uses a **scripted gateway** (no real network) and providers with **empty secrets** (no keychain), keeping it deterministic and offline. The CLI `deps` are inlined as a fake `CliDeps` (the same shape `09-cli.md` pins); if `runCli`'s exact `CliDeps` differs, adapt the inline fake — do not change `runCli`.

- [ ] **Step 3: Make it GREEN** — implement nothing new for the proxy/CLI/config/harness assertions (they exercise shipped code); the only new code this task needs is the `buildTrayMenu` import (from tray-polish-01) and the test file itself. If any assertion fails, the failure is a real integration regression in the named package — fix it there per its plan, not by weakening the assertion.

- [ ] **Step 4: Write the manual-verification checklist** — `apps/desktop/MANUAL-VERIFICATION.md`, covering the parts that need the built desktop binary (the automated test cannot drive a native window/tray):

```markdown
# LaunchKit — Manual Verification Checklist (built desktop app)

Run after `bunx electrobun build` in `apps/desktop`. These steps cover what `bun test` cannot:
the native window, the native tray, and click-through behavior. Check each box on a real macOS run.

## Build & launch
- [ ] `bunx electrobun build` completes with no errors.
- [ ] Launching the built binary with **no args** opens the GUI window titled "LaunchKit".
- [ ] A **tray icon** appears in the macOS menu bar.

## Tray menu (tray-and-polish)
- [ ] The tray's **first item** is a status row: green dot + "Proxy: on" while the GUI is open
      (the persistent proxy is running); it reads grey + "Proxy: off" if the proxy is stopped.
- [ ] The **Launch** submenu lists one item per configured harness (built-ins: Claude Code, Codex,
      opencode, openclaw), or "No harnesses configured" when none exist.
- [ ] Clicking a **Launch** item spawns that harness (terminal/child process appears) using its
      default alias, and a new row appears in the **Sessions** page.
- [ ] **Open LaunchKit** focuses/opens the main window.
- [ ] **Quit** exits the app (window + tray disappear).

## CLI mode
- [ ] `launchkit list harnesses` prints the built-in harness ids (no window opens).
- [ ] `launchkit list providers` prints provider ids/names and **never** prints a secret value or ref.
- [ ] With the GUI open, a CLI `launch` reuses the running proxy (no second proxy starts).

## Provider connectivity test (tray-and-polish)
- [ ] In the Providers page, "Test" on a correctly-configured provider reports **ok** with a latency.
- [ ] "Test" on a provider with a missing/invalid key reports **not ok** (no secret value shown).

## Config import/export (tray-and-polish)
- [ ] Export produces a JSON file containing provider config + keychain **refs** but **no secret values**.
- [ ] Importing that file restores providers/aliases; importing a foreign/invalid file is rejected
      with a clear message (and does not corrupt the existing config).

## Security spot-checks
- [ ] The proxy is bound to `127.0.0.1` only (e.g. `lsof -iTCP -sTCP:LISTEN -P | grep launchkit`
      shows loopback, never `*` / `0.0.0.0`).
- [ ] No secret value appears in any log line, the exported config, or the webview dev tools.
```

- [ ] **Step 5: Commit** `test(desktop): add darwin-gated e2e integration test + manual-verification checklist [tray-polish-05]`.

---

### Task tray-polish-06: Wrap-up — whole-repo gate green + finalize `PROGRESS.md`

**Files:**
- Edit: `PROGRESS.md` (repo root)
- Edit: `apps/desktop/CLAUDE.md` (note the tray ownership, if not already present)

The final task: prove the entire repository passes the gate and record completion. No new behavior — this is the project's Definition-of-Done sweep per `build-plan/EXECUTION.md`.

- [ ] **Step 1: Run the full gate from the repo root** — `bun run typecheck && bun run lint && bun test`. Expected: typecheck clean (strict, no `any` outside the one confined Electrobun seam marker comment in `tray.ts`), Biome lint+format clean, and **all** tests pass across every package and `apps/desktop` — including the new `tray-menu`, `tray`, `provider-tester`, `transfer`, and (on darwin) the `e2e.integration` suites. If anything fails, fix it under the owning plan before proceeding (do not mark done with a red gate — `superpowers:verification-before-completion`).

- [ ] **Step 2: Confirm the cross-plan wiring is live** — verify the three integration points this plan added to files owned by `11-desktop-shell.md` are present and green:
  - `apps/desktop/src/main.ts` mounts the tray in GUI mode (tray-polish-02 Step 5).
  - `apps/desktop/src/composition.ts` `testProvider` delegates to `createProviderTester` (tray-polish-03 Step 6).
  - The proxy barrel exports `createProviderTester`; the config barrel exports `exportConfig`/`importConfig`.
  If `11-desktop-shell.md` was not yet `done` when those steps ran, complete them now (they were marked `blocked`), then re-run the gate.

- [ ] **Step 3: Update `apps/desktop/CLAUDE.md`** — confirm the tray line is accurate now that this plan owns it (it was listed as "Owned by OTHER plans: `src/gui/tray.ts` (tray-and-polish)" in `11-desktop-shell.md`). Add one sentence under **Local rules** if missing:

```markdown
- The system tray (`src/gui/tray.ts`) is built from the PURE `buildTrayMenu` descriptor (`src/gui/tray-menu.ts`); the native Electrobun Tray lives only behind the `MountTrayDeps.createTray` seam, and a Launch click reuses the same `ctx.launch` + `ctx.sessions.create` path as the IPC `launchHarness` handler.
```

- [ ] **Step 4: Finalize `PROGRESS.md`** — mark `tray-polish-01..06` `done` with their commit SHAs. Then do the project closeout sweep: confirm **every** task across all plans is `done` (or an explicitly-recorded `blocked` with a one-line reason, e.g. an Electrobun seam that could not be wired in this environment). `PROGRESS.md` is the single source of truth (`EXECUTION.md`): if a task is not recorded `done`, it is not done. Add a short closing note at the top of `PROGRESS.md`:

```markdown
## Status: Phase 3 complete

All build-plan tasks are `done`. The LaunchKit binary builds (`bunx electrobun build`), the full gate
(`bun run typecheck && bun run lint && bun test`) is green, and the manual-verification checklist
(`apps/desktop/MANUAL-VERIFICATION.md`) covers the native window/tray paths that automated tests cannot.
Any remaining `blocked` items are listed below with reasons (typically: live Electrobun Tray/Window
wiring that requires a built app on a real macOS desktop).
```

- [ ] **Step 5: Commit** `chore: finalize PROGRESS.md + green whole-repo gate [tray-polish-06]`.

**End state:** LaunchKit's Phase-3 surface is complete and polished. The system tray is a **pure** `buildTrayMenu` descriptor (status dot reflecting proxy state, a per-harness Launch submenu, Open/Quit) plus a **thin Electrobun seam** (`mountTray`) whose click routing reuses the exact `ctx.launch` + `ctx.sessions.create` path as the IPC `launchHarness` handler — the pure builder is exhaustively unit-tested and the seam is smoke-tested with a fake tray. `@launchkit/proxy` exports `createProviderTester`, a connectivity probe over the existing `ProviderFactory`/`LanguageModelGateway` seams with an injected `Clock` for deterministic latency, sending a minimal 1-token `"ping"` (the desktop `testProvider` IPC handler delegates to it via `ctx.testProvider`). `@launchkit/config` exports pure `exportConfig` (pretty JSON; secrets are refs-only, asserted to contain no values) and `importConfig` (validated through `runMigrations` + `ConfigSchema`, rejecting invalid/foreign/inline-secret/non-loopback shapes). A darwin-gated `e2e.integration.test.ts` proves the CLI `list`, a real loopback `/health`, and a built tray menu compose, with a `MANUAL-VERIFICATION.md` checklist for the native window/tray paths beyond `bun test`'s reach. Finally the whole-repo gate (`bun run typecheck && bun run lint && bun test`) is green and `PROGRESS.md` records every task `done`. Security and performance are enforced and tested throughout: no secret value crosses the export or IPC boundary, the connectivity probe is the cheapest possible round-trip, and tray menu building is pure and allocation-light.
