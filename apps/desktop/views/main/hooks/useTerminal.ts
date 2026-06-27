import type { SessionId } from "@spectrum/types"
import { isOk } from "@spectrum/utils"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTerminalStore } from "../stores/terminalStore"
import type { TerminalClient } from "../terminal/terminalClient"
import { useNotifications } from "./useNotifications"

export interface UseTerminalInput {
  readonly sessionId: SessionId
  readonly terminalClient: TerminalClient
  readonly ipcClient: {
    resolveTerminalCwd(params: {
      sessionId: SessionId
    }): Promise<
      | { ok: true; value: { cwd: string } }
      | { ok: false; error: { kind: string; path?: string } }
    >
  }
  /**
   * Injectable for tests; defaults to the real Terminal constructor. Lazy-
   * loaded only on mount so test runs that never mount a pane never need
   * xterm in the module graph.
   */
  readonly createTerminal?: new (
    opts: object,
  ) => XtermTerminal
}

// Minimal structural type for Terminal so we can avoid pulling @xterm/xterm
// at module-load time (heavy DOM dependency, not always installed at test time).
export interface XtermTerminal {
  readonly element: HTMLElement | undefined
  loadAddon(addon: unknown): void
  open(parent: HTMLElement): void
  write(data: string): void
  onData(handler: (data: string) => void): void
  dispose(): void
}

export interface XtermFitAddon {
  fit(): void
}

export interface UseTerminalResult {
  readonly paneOpen: boolean
  readonly paneHeightPx: number
  readonly tabs: ReturnType<
    typeof useTerminalStore.getState
  >["sessions"][string]["tabs"]
  readonly activeTabId: string | null
  openPane(): Promise<void>
  closePane(): void
  newTab(): Promise<void>
  closeTab(tabId: string): void
  selectTab(tabId: string): void
  sendInput(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  mountTerminal(tabId: string, container: HTMLElement): void
}

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

interface XtermModule {
  Terminal: new (opts: object) => XtermTerminal
}
interface FitModule {
  FitAddon: new () => XtermFitAddon
}
interface WebglModule {
  WebglAddon: new () => unknown
}
interface ClipboardModule {
  ClipboardAddon: new () => unknown
}
interface SearchModule {
  SearchAddon: new () => unknown
}

/**
 * Bun's ESM runtime resolves `require()` for npm packages even when the host
 * package is "type": "module". We use that to load xterm + addons lazily —
 * the brief keeps clipboard + search optional, and the entire xterm graph
 * stays out of the test bundle.
 */
const tryRequire = <T>(specifier: string): T | undefined => {
  try {
    return require(specifier) as T
  } catch {
    return undefined
  }
}

export const useTerminal = (input: UseTerminalInput): UseTerminalResult => {
  const { notify } = useNotifications()
  const state = useTerminalStore(
    (s) =>
      s.sessions[input.sessionId] ?? {
        tabs: [],
        activeTabId: null,
        paneOpen: false,
        paneHeightPx: 220,
      },
  )
  // xterm instances keyed by tabId — kept alive while paneOpen=false for
  // scrollback survival; disposed only on explicit closeTab.
  const terms = useRef(new Map<string, XtermTerminal>())
  const fits = useRef(new Map<string, XtermFitAddon>())

  const measureColsRows = useCallback(
    (container?: HTMLElement): { cols: number; rows: number } => {
      if (!container) return { cols: DEFAULT_COLS, rows: DEFAULT_ROWS }
      try {
        const cols =
          Math.max(1, Math.floor(container.clientWidth / 9)) || DEFAULT_COLS
        const rows =
          Math.max(1, Math.floor(container.clientHeight / 18)) || DEFAULT_ROWS
        return { cols, rows }
      } catch {
        return { cols: DEFAULT_COLS, rows: DEFAULT_ROWS }
      }
    },
    [],
  )

  const sendInput = useCallback(
    (tabId: string, data: string) => {
      input.terminalClient.input({
        sessionId: input.sessionId,
        tabId,
        data: btoa(data),
      })
    },
    [input],
  )

  const openPane = useCallback(async () => {
    useTerminalStore.getState().openPane(input.sessionId)
    const r = await input.ipcClient.resolveTerminalCwd({
      sessionId: input.sessionId,
    })
    if (!isOk(r)) {
      notify({
        tone: "error",
        message: "No working directory for this session",
      })
      return
    }
    const s = useTerminalStore.getState().sessions[input.sessionId]
    if (!s || s.tabs.length === 0) return
    const tab = s.tabs[0]
    if (!tab) return
    const { cols, rows } = measureColsRows()
    input.terminalClient.open({
      sessionId: input.sessionId,
      tabId: tab.id,
      cwd: r.value.cwd,
      cols,
      rows,
    })
    input.terminalClient.onOutput(input.sessionId, tab.id, (data) => {
      terms.current.get(tab.id)?.write(atob(data))
    })
    input.terminalClient.onExited(input.sessionId, tab.id, (exitCode) => {
      useTerminalStore.getState().setTabExit(input.sessionId, tab.id, exitCode)
    })
    input.terminalClient.onError(input.sessionId, tab.id, (message) => {
      notify({ tone: "error", message })
    })
  }, [input, measureColsRows, notify])

  const closePane = useCallback(() => {
    useTerminalStore.getState().closePane(input.sessionId)
    // intentionally NO term-close — background survival
  }, [input])

  const newTab = useCallback(async () => {
    useTerminalStore.getState().newTab(input.sessionId)
    const s = useTerminalStore.getState().sessions[input.sessionId]
    if (!s) return
    const tab = s.tabs[s.tabs.length - 1]
    if (!tab) return
    const r = await input.ipcClient.resolveTerminalCwd({
      sessionId: input.sessionId,
    })
    if (!isOk(r)) {
      notify({
        tone: "error",
        message: "No working directory for this session",
      })
      return
    }
    const { cols, rows } = measureColsRows()
    input.terminalClient.open({
      sessionId: input.sessionId,
      tabId: tab.id,
      cwd: r.value.cwd,
      cols,
      rows,
    })
    input.terminalClient.onOutput(input.sessionId, tab.id, (data) =>
      terms.current.get(tab.id)?.write(atob(data)),
    )
    input.terminalClient.onExited(input.sessionId, tab.id, (exitCode) =>
      useTerminalStore.getState().setTabExit(input.sessionId, tab.id, exitCode),
    )
    input.terminalClient.onError(input.sessionId, tab.id, (message) =>
      notify({ tone: "error", message }),
    )
  }, [input, measureColsRows, notify])

  const closeTab = useCallback(
    (tabId: string) => {
      input.terminalClient.close({ sessionId: input.sessionId, tabId })
      const term = terms.current.get(tabId)
      if (term) {
        term.dispose()
        terms.current.delete(tabId)
        fits.current.delete(tabId)
      }
      useTerminalStore.getState().closeTab(input.sessionId, tabId)
    },
    [input],
  )

  const selectTab = useCallback(
    (tabId: string) => {
      useTerminalStore.getState().selectTab(input.sessionId, tabId)
    },
    [input],
  )

  const resize = useCallback(
    (tabId: string, cols: number, rows: number) => {
      input.terminalClient.resize({
        sessionId: input.sessionId,
        tabId,
        cols,
        rows,
      })
    },
    [input],
  )

  const mountTerminal = useCallback(
    (tabId: string, container: HTMLElement): void => {
      const existing = terms.current.get(tabId)
      if (existing) {
        if (!existing.element) existing.open(container)
        fits.current.get(tabId)?.fit()
        return
      }
      const xtermMod = tryRequire<XtermModule>("@xterm/xterm")
      const fitMod = tryRequire<FitModule>("@xterm/addon-fit")
      const Ctor = input.createTerminal ?? xtermMod?.Terminal
      if (!Ctor || !fitMod) {
        notify({
          tone: "error",
          message: "Terminal renderer unavailable",
        })
        return
      }
      const term: XtermTerminal = new Ctor({ convertEol: false })
      const fit = new fitMod.FitAddon()
      term.loadAddon(fit)
      const webgl = tryRequire<WebglModule>("@xterm/addon-webgl")
      try {
        if (webgl) term.loadAddon(new webgl.WebglAddon())
      } catch {
        /* canvas/WebGL unavailable — canvas2d fallback */
      }
      const clipboard = tryRequire<ClipboardModule>("@xterm/addon-clipboard")
      try {
        if (clipboard) term.loadAddon(new clipboard.ClipboardAddon())
      } catch {
        /* addon not installed on this build — noop */
      }
      const search = tryRequire<SearchModule>("@xterm/addon-search")
      try {
        if (search) term.loadAddon(new search.SearchAddon())
      } catch {
        /* addon not installed on this build — noop */
      }
      term.onData((data) => sendInput(tabId, data))
      terms.current.set(tabId, term)
      fits.current.set(tabId, fit)
      if (!term.element) term.open(container)
      fit.fit()
    },
    [input, sendInput, notify],
  )

  // hydrate persisted pane state on mount
  useEffect(() => {
    useTerminalStore.getState().hydrate(input.sessionId)
  }, [input.sessionId])

  return useMemo(
    () => ({
      paneOpen: state.paneOpen,
      paneHeightPx: state.paneHeightPx,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      openPane,
      closePane,
      newTab,
      closeTab,
      selectTab,
      sendInput,
      resize,
      mountTerminal,
    }),
    [
      state,
      openPane,
      closePane,
      newTab,
      closeTab,
      selectTab,
      sendInput,
      resize,
      mountTerminal,
    ],
  )
}
