import { isOk } from "@launchkit/utils"
import type { Tray as ElectrobunTray, MenuItemConfig } from "electrobun/bun"
import type { AppContext } from "../composition"
import { type TrayItem, type TrayMenu, buildTrayMenu } from "./tray-menu"

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
 * clicks: `open` → openWindow, `quit` → quit, `launch:<id>` → open an embedded terminal session for
 * that harness as a DEFAULT launch (= bypass the proxy) — reusing the SAME path as
 * `createIpcHandlers.launchHarness` (`ctx.resolveLaunch(...)` then `ctx.terminal.launch(...)`; the
 * manager owns session creation). Thin by design: all the menu shape lives in the pure
 * `buildTrayMenu`; this only assembles + dispatches.
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

  /**
   * Launch a harness by id via the shared embedded-terminal path (mirrors the IPC handler):
   * resolve the command (DEFAULT launch = bypass, so no proxy env is rendered), then
   * `ctx.terminal.launch` (which creates the Session itself — so we do NOT call `ctx.sessions.create`).
   * On success, bring the window forward so the user sees the new terminal tab; never block on exit.
   */
  const launchById = async (harnessId: string): Promise<void> => {
    const list = await ctx.registry.list()
    if (!isOk(list)) return
    const harness = list.value.find((h) => String(h.id) === harnessId)
    if (harness === undefined) return

    // A tray quick-launch is a DEFAULT launch: bypass the proxy (route kind "direct").
    const resolved = ctx.resolveLaunch({ harness, route: { kind: "direct" } })
    if (!isOk(resolved)) return

    const opened = ctx.terminal.launch({
      harnessId: harness.id,
      command: resolved.value.command,
      args: resolved.value.args,
      env: resolved.value.env,
    })
    if (!isOk(opened)) return // pty failed → no session was recorded by the manager

    actions.openWindow() // surface the window so the new terminal tab is visible
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
 * PURE: translate one `TrayItem` to an Electrobun `MenuItemConfig`, assigning actionable items the
 * clickId convention (`"open"`, `"quit"`, `"launch:<harnessId>"`) as their native `action`. Status
 * and placeholder items are rendered as disabled (no action); submenus recurse.
 */
const toNativeItem = (item: TrayItem): MenuItemConfig => {
  switch (item.kind) {
    case "separator":
      return { type: "separator" }
    case "status":
      return { type: "normal", label: item.label, enabled: false }
    case "disabled":
      return { type: "normal", label: item.label, enabled: false }
    case "submenu":
      return {
        type: "normal",
        label: item.label,
        submenu: item.items.map(toNativeItem),
      }
    case "open":
      return { type: "normal", label: item.label, action: "open" }
    case "quit":
      return { type: "normal", label: item.label, action: "quit" }
    case "launch":
      return {
        type: "normal",
        label: item.label,
        action: `launch:${item.harnessId}`,
      }
  }
}

/** PURE: render the whole descriptor as the Electrobun native menu config. */
const toNativeMenu = (menu: TrayMenu): MenuItemConfig[] =>
  menu.items.map(toNativeItem)

/**
 * Production Electrobun wiring. Builds a native `Tray`, renders the descriptor (clickIds carried as
 * each item's `action`), and routes `tray-clicked` events — whose payload `action` is the clicked
 * item's clickId — back through `onClick`. `setMenu` re-renders; `destroy` removes the native tray.
 */
export const realMountTrayDeps: MountTrayDeps = {
  createTray: (menu, onClick) => {
    let tray: ElectrobunTray | null = null
    let current: TrayMenu = menu

    // Load Electrobun lazily — and only in the built binary (see the same note in `gui/window.ts`).
    // The returned handle works before the native tray resolves: `setMenu` buffers into `current`,
    // which is applied as soon as the tray is created.
    void import("electrobun/bun").then(({ Tray }) => {
      const native = new Tray({ title: "LaunchKit" })
      tray = native
      native.setMenu(toNativeMenu(current))
      native.on("tray-clicked", (event) => {
        const action = (event as { action?: string }).action
        if (action !== undefined && action !== "") onClick(action)
      })
    })

    return {
      setMenu: (next: TrayMenu) => {
        current = next
        if (tray !== null) tray.setMenu(toNativeMenu(next))
      },
      destroy: () => {
        if (tray !== null) tray.remove()
      },
    }
  },
}
