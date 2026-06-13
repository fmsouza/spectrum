import type { SessionId } from "@spectrum/types"
import { type StoreApi, createStore } from "zustand/vanilla"

/**
 * The top-level app view. `sessions` carries the optionally-selected session id;
 * `settings` carries the active section key. Serialized to the URL hash so a
 * reload lands on the same place (no remote navigation).
 */
export type View =
  | { readonly kind: "sessions"; readonly selectedSessionId?: SessionId }
  | { readonly kind: "settings"; readonly section: string }

/** Parse a raw hash (e.g. `#settings/providers` or `settings/providers`) into a `View`. */
export const parseView = (raw: string): View => {
  const [kind, rest] = raw.replace(/^#/, "").split("/", 2)
  if (kind === "settings")
    return { kind: "settings", section: rest ?? "general" }
  if (kind === "sessions")
    return rest === undefined || rest === ""
      ? { kind: "sessions" }
      : { kind: "sessions", selectedSessionId: rest as SessionId }
  // Anything else (incl. the retired #dashboard) collapses to the default sessions view.
  return { kind: "sessions" }
}

/** Encode a `View` back to its hash representation (leading `#` included). */
export const encodeView = (view: View): string =>
  view.kind === "settings"
    ? `#settings/${view.section}`
    : view.selectedSessionId === undefined
      ? "#sessions"
      : `#sessions/${view.selectedSessionId}`

export type UiStore = {
  readonly view: View
  readonly openSessionIds: readonly SessionId[]
  readonly modalOpen: boolean
  readonly navigate: (view: View) => void
  readonly openSession: (id: SessionId) => void
  readonly closeSession: (id: SessionId) => void
  readonly setModalOpen: (open: boolean) => void
}

export const createUiStore = (initialView: string): StoreApi<UiStore> =>
  createStore<UiStore>()((set) => ({
    view: parseView(initialView),
    openSessionIds: [],
    modalOpen: false,
    navigate: (view) => set({ view }),
    openSession: (id) =>
      set((s) =>
        s.openSessionIds.includes(id)
          ? s
          : { openSessionIds: [...s.openSessionIds, id] },
      ),
    closeSession: (id) =>
      set((s) => ({
        openSessionIds: s.openSessionIds.filter((x) => x !== id),
      })),
    setModalOpen: (open) => set({ modalOpen: open }),
  }))
