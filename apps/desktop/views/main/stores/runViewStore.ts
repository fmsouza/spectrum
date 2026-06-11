import {
  type CanonicalEvent,
  type PermissionMode,
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
  /** Whether a turn is in flight (drives the typing indicator) — see `nextBusy`. */
  readonly busyBySession: Readonly<Record<string, boolean>>
  readonly modeBySession: Readonly<Record<string, PermissionMode>>
  readonly applyEvent: (sessionId: SessionId, event: CanonicalEvent) => void
  readonly reset: (sessionId: SessionId) => void
  readonly openSub: (sessionId: SessionId, runnerId: RunnerId) => void
  readonly closeSub: (sessionId: SessionId) => void
  readonly setMode: (sessionId: SessionId, mode: PermissionMode) => void
}

/**
 * Derive the next "busy" (turn-in-flight) flag from an event. A turn begins when the user sends (the
 * runtime echoes it as a role:user text-delta) and ends when the ROOT runner reports the turn/run done
 * (`turn-finished` for streaming harnesses like opencode; `runner-finished` for claude/codex/openclaw).
 */
const nextBusy = (
  prev: boolean,
  event: CanonicalEvent,
  state: RunState,
): boolean => {
  if (event.type === "text-delta" && event.role === "user") return true
  const root = state.rootRunnerId
  if (
    (event.type === "turn-finished" || event.type === "runner-finished") &&
    event.runnerId === root
  )
    return false
  return prev
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
    busyBySession: {},
    modeBySession: {},

    applyEvent: (sessionId, event) => {
      const prev = get().byId[sessionId] ?? initialRunState
      const next = reduce(prev, event)
      const busy = nextBusy(
        get().busyBySession[sessionId] ?? false,
        event,
        next,
      )
      set((state) => ({
        byId: { ...state.byId, [sessionId]: next },
        busyBySession: { ...state.busyBySession, [sessionId]: busy },
      }))
    },

    reset: (sessionId) => {
      set((state) => {
        const { [sessionId]: _removed, ...rest } = state.byId
        const { [sessionId]: _sub, ...subRest } = state.openSubBySession
        const { [sessionId]: _busy, ...busyRest } = state.busyBySession
        const { [sessionId]: _mode, ...modeRest } = state.modeBySession
        return {
          byId: rest,
          openSubBySession: subRest,
          busyBySession: busyRest,
          modeBySession: modeRest,
        }
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

    setMode: (sessionId, mode) => {
      set((state) => ({
        modeBySession: { ...state.modeBySession, [sessionId]: mode },
      }))
    },
  }))
