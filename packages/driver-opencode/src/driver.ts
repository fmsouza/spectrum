import type { AgentDriver } from "@launchkit/agent-driver"
import type { IdGen } from "@launchkit/utils"

/** Placeholder deps — replaced by the real implementation in Task 5. */
export interface OpencodeDriverDeps {
  readonly idGen: IdGen
}

/** Stub — replaced by the real implementation in Task 5 (RED→GREEN). */
export const createOpencodeDriver = (
  _deps: OpencodeDriverDeps,
): AgentDriver => {
  throw new Error("not implemented")
}
