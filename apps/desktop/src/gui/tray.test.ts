import { describe, expect, it, mock } from "bun:test"
import {
  createFakeCommandResolver,
  resolveHarnessLaunch,
} from "@launchkit/harnesses"
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
    terminalOk?: boolean
  } = {},
): {
  ctx: AppContext
  terminalInputs: unknown[]
  sessionInputs: unknown[]
} => {
  const terminalInputs: unknown[] = []
  const sessionInputs: unknown[] = []
  const resolveLaunch = resolveHarnessLaunch({
    resolver: createFakeCommandResolver({ claude: "/usr/local/bin/claude" }),
  })
  const ctx = {
    registry: { list: async () => ok(over.harnesses ?? [harness]) },
    resolveLaunch,
    runtime: {
      readProxyKey: async () => null,
      writeProxyKey: async () => ok(undefined),
      clear: async () => undefined,
    },
    terminal: {
      launch: (input: unknown) => {
        terminalInputs.push(input)
        return over.terminalOk === false
          ? err({ kind: "pty-open-failed", detail: "ENOENT" })
          : ok({ sessionId: sampleSession.id })
      },
      handleInbound: () => undefined,
      bindSend: () => undefined,
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
  return { ctx, terminalInputs, sessionInputs }
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

  it("opens a terminal session with the resolved env and focuses the window when a Launch item is clicked", async () => {
    const { ctx, terminalInputs, sessionInputs } = makeCtx({
      harnesses: [harness],
    })
    const openWindow = mock(() => {})
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    // Same path as the IPC handler: resolve env then ctx.terminal.launch — the manager owns the session.
    expect(terminalInputs).toHaveLength(1)
    expect(terminalInputs[0]).toMatchObject({
      harnessId: harness.id,
      alias: harness.defaultAlias,
      command: "/usr/local/bin/claude",
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" },
    })
    // The handler must NOT create a session directly (the manager does it).
    expect(sessionInputs).toEqual([])
    // The window is brought forward so the user sees the new terminal tab.
    expect(openWindow).toHaveBeenCalledTimes(1)
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

  it("does not record a session when the terminal fails to open", async () => {
    const { ctx, sessionInputs } = makeCtx({
      harnesses: [harness],
      terminalOk: false,
    })
    const { deps, click } = captureTray()

    await mountTray(ctx, { openWindow: () => {}, quit: () => {} }, deps)
    click("launch:claude")
    await flushMicrotasks() // let the detached launchById promises settle

    expect(sessionInputs).toEqual([]) // pty failed → no session recorded
  })
})
