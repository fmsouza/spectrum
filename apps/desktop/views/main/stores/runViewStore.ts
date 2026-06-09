import {
  type CanonicalEvent,
  type RunState,
  type RunnerId,
  initialRunState,
  reduce,
} from "@launchkit/agent-events"
import type { SessionId } from "@launchkit/types"
import { type StoreApi, createStore } from "zustand/vanilla"
import type { StoreDeps } from "./types"

export type RunViewStore = {
  readonly byId: Readonly<Record<string, RunState>>
  readonly openSubBySession: Readonly<Record<string, RunnerId>>
  readonly applyEvent: (sessionId: SessionId, event: CanonicalEvent) => void
  readonly reset: (sessionId: SessionId) => void
  readonly openSub: (sessionId: SessionId, runnerId: RunnerId) => void
  readonly closeSub: (sessionId: SessionId) => void
}

/**
 * Webview store of reduced `RunState` per session (the §3.6 `runViewStore`,
 * distinct from the backend `RunStore`). `RunDetail` owns the socket and calls
 * `applyEvent` for each inbound frame; the shared `reduce` does the folding so
 * live and replay produce identical state. `deps` is unused (kept for bundle
 * symmetry with the IPC-backed stores).
 */
export const createRunViewStore = (_deps: StoreDeps): StoreApi<RunViewStore> =>
  createStore<RunViewStore>()((set, get) => ({
    byId: {},
    openSubBySession: {},

    applyEvent: (sessionId, event) => {
      const prev = get().byId[sessionId] ?? initialRunState
      const next = reduce(prev, event)
      set((state) => ({ byId: { ...state.byId, [sessionId]: next } }))
    },

    reset: (sessionId) => {
      set((state) => {
        const { [sessionId]: _removed, ...rest } = state.byId
        const { [sessionId]: _sub, ...subRest } = state.openSubBySession
        return { byId: rest, openSubBySession: subRest }
      })
    },

    openSub: (sessionId, runnerId) => {
      set((state) => ({
        openSubBySession: { ...state.openSubBySession, [sessionId]: runnerId },
      }))
    },

    closeSub: (sessionId) => {
      set((state) => {
        const { [sessionId]: _removed, ...rest } = state.openSubBySession
        return { openSubBySession: rest }
      })
    },
  }))
