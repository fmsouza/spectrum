import type { ModelHandle } from "./providers/factory"
import type { NormalizedRequest, StreamEvent } from "./types"

export interface LanguageModelGateway {
  stream(model: ModelHandle, req: NormalizedRequest): AsyncIterable<StreamEvent>
}

export type TimeoutWindows = {
  readonly firstTokenTimeoutMs: number
  readonly interTokenTimeoutMs: number
}

export const createScriptedGateway = (
  events: readonly StreamEvent[],
): LanguageModelGateway => ({
  async *stream() {
    for (const e of events) yield e
  },
})
