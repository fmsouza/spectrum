import type { SessionId } from "@spectrum/types"
import type { TabId } from "./protocol"

export type TerminalError =
  | { readonly kind: "spawn-failed"; readonly message: string }
  | { readonly kind: "cwd-missing"; readonly path: string }
  | {
      readonly kind: "unknown-tab"
      readonly sessionId: SessionId
      readonly tabId: TabId
    }
  | { readonly kind: "not-implemented" }
