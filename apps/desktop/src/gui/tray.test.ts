import { describe, expect, it, mock } from "bun:test"
import {
  AliasNameSchema,
  type HarnessDefinition,
  HarnessIdSchema,
  type Session,
} from "@launchkit/types"
import { err, ok } from "@launchkit/utils"
import type { AppContext } from "../composition"
import { mountTray } from "./tray"
import type { MountTrayDeps, TrayHandle } from "./tray"
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
  over: {
    harnesses?: readonly HarnessDefinition[]
    proxyRunning?: boolean
    launchOk?: boolean
  } = {},
): { ctx: AppContext; launchParams: unknown[]; sessionInputs: unknown[] } => {
  const launchParams: unknown[] = []
  const sessionInputs: unknown[] = []
  const ctx = {
    registry: { list: async () => ok(over.harnesses ?? [harness]) },
    launch: (params: unknown) => {
      launchParams.push(params)
      return over.launchOk === false
        ? err({ kind: "spawn-failed", detail: "ENOENT" })
        : ok({ pid: 42, exited: Promise.resolve(0) })
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
    proxy: {
      isRunning: async () => over.proxyRunning ?? true,
      start: () => ({ hostname: "127.0.0.1", port: 4000, stop: () => {} }),
    },
    proxyBaseUrl: "http://127.0.0.1:4000",
    genProxyKey: () => "k-test",
    config: {
      load: async () =>
        ok({
          version: 2,
          providers: [],
          aliases: [],
          settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
        }),
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
    createTray: (
      menu: TrayMenu,
      handler: (clickId: string) => void,
    ): TrayHandle => {
      rendered.push(menu)
      onClick = handler
      return { setMenu: (m: TrayMenu) => rendered.push(m), destroy: () => {} }
    },
  }
  return {
    deps,
    rendered,
    click: (clickId: string): void => {
      if (onClick === undefined)
        throw new Error("createTray was not called before click()")
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
    expect(rendered[0]?.items[0]).toMatchObject({
      kind: "status",
      dot: { state: "on", color: "green" },
    })
    const submenu = rendered[0]?.items.find((i) => i.kind === "submenu")
    expect(submenu).toMatchObject({
      kind: "submenu",
      items: [{ kind: "launch", harnessId: "claude" }],
    })
  })

  it("launches the harness with its defaultAlias and records a session when a Launch item is clicked", async () => {
    const { ctx, launchParams, sessionInputs } = makeCtx({
      harnesses: [harness],
    })
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    // Same launch path as the IPC handler: ctx.launch(...) then ctx.sessions.create({ harnessId, alias }).
    expect(launchParams).toHaveLength(1)
    expect(launchParams[0]).toMatchObject({
      harness,
      model: harness.defaultAlias,
    })
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
    const { ctx, sessionInputs } = makeCtx({
      harnesses: [harness],
      launchOk: false,
    })
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    expect(sessionInputs).toEqual([]) // spawn failed → no session recorded
  })
})
