import type { CanonicalEvent, RunnerId } from "@launchkit/agent-events"
import type { OpencodeEvent } from "./transport"

/** Placeholder mapping state — replaced by the real implementation in Task 3. */
export interface OpencodeMapState {
  readonly rootRunnerId: RunnerId
}

/** Stub — replaced by the real implementation in Task 3 (RED→GREEN). */
export const newOpencodeMapState = (_deps: {
  readonly rootRunnerId: RunnerId
  readonly rootSessionId: string
  readonly newRunnerId: () => RunnerId
}): OpencodeMapState => {
  throw new Error("not implemented")
}

/** Stub — replaced by the real implementation in Task 3 (RED→GREEN). */
export const mapOpencodeEvent = (
  _event: OpencodeEvent,
  _state: OpencodeMapState,
): readonly CanonicalEvent[] => {
  throw new Error("not implemented")
}
