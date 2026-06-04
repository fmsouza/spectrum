/**
 * Local type surface for the Electrobun **bun-side** API (`electrobun/bun`) we consume.
 *
 * WHY THIS EXISTS: Electrobun (v1.18.x) publishes its API as raw `.ts` source via its package
 * `exports` (e.g. `"electrobun/bun" → dist/api/bun/index.ts`), not pre-built `.d.ts`. That source
 * does not compile under this repo's strict settings (`exactOptionalPropertyTypes`,
 * `noImplicitReturns`, no implicit `any`, missing `@types/three`), and `skipLibCheck` only skips
 * `.d.ts` files — so importing it directly drags Electrobun's internals into our typecheck and fails
 * the gate. This file is mapped onto `"electrobun/bun"` via the desktop `tsconfig.json` `paths`
 * (TYPE RESOLUTION ONLY) — Bun's runtime and the Electrobun bundler resolve the real module.
 *
 * It models ONLY the subset used by `gui/window.ts` and `gui/tray.ts`. Extend it (against
 * `node_modules/electrobun/dist/api/bun/**`) if we start using more of the API.
 */

/** Window frame geometry (all fields required when `frame` is supplied). */
export interface WindowFrame {
  width: number
  height: number
  x: number
  y: number
}

/** Subset of `WindowOptionsType` used here. `rpc` accepts a `defineElectrobunRPC` result. */
export interface WindowOptions {
  title?: string
  url?: string | null
  frame?: WindowFrame
  rpc?: unknown
  renderer?: "native" | "cef"
}

export class BrowserWindow {
  constructor(options?: WindowOptions)
}

/** Subset of the `defineElectrobunRPC` config (bun side). */
export interface ElectrobunRpcConfig {
  maxRequestTime?: number
  handlers: {
    requests?: Record<string, (payload: unknown) => unknown>
    messages?: Record<string, (payload: unknown) => unknown>
  }
  /** Untyped escape hatch for dynamically-built request handlers (one per IPC method). */
  extraRequestHandlers?: Record<string, (payload: unknown) => unknown>
}

/** Create the bun-side RPC object passed to `BrowserWindow({ rpc })`. */
export function defineElectrobunRPC(
  side: "bun" | "webview",
  config: ElectrobunRpcConfig,
): unknown

/** Native tray menu item descriptor. */
export type MenuItemConfig =
  | { type: "divider" | "separator" }
  | {
      type: "normal"
      label: string
      tooltip?: string
      action?: string
      submenu?: MenuItemConfig[]
      enabled?: boolean
      checked?: boolean
      hidden?: boolean
    }

export interface TrayOptions {
  title?: string
  image?: string
  template?: boolean
  width?: number
  height?: number
}

export class Tray {
  constructor(options?: TrayOptions)
  setMenu(menu: MenuItemConfig[]): void
  on(name: "tray-clicked", handler: (event: unknown) => void): void
  remove(): void
}

/** Options for the native open dialog. `exactOptionalPropertyTypes`-safe (no `| undefined`). */
export interface OpenFileDialogOptions {
  canChooseDirectory?: boolean
  canChooseFiles?: boolean
  allowsMultipleSelection?: boolean
  startingFolder?: string
}

/** Subset of the Electrobun bun-side `Utils` namespace we consume. */
export const Utils: {
  /** Native open panel; resolves the selected paths (empty array if cancelled). */
  openFileDialog(options?: OpenFileDialogOptions): Promise<string[]>
}
