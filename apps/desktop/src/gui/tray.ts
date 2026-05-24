import { isOk } from "@launchkit/utils"
import type { AppContext } from "../composition"
import { type TrayMenu, buildTrayMenu } from "./tray-menu"

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
  readonly createTray: (
    menu: TrayMenu,
    onClick: (clickId: string) => void,
  ) => TrayHandle
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
    throw new Error(
      "mountTray: wire the real Electrobun Tray here (see ELECTROBUN NOTE)",
    )
  },
}
