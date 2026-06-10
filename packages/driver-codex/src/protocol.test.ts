import { describe, expect, it } from "bun:test"
import {
  AGENT_MESSAGE_DELTA,
  COMMAND_OUTPUT_DELTA,
  ERROR_NOTIFICATION,
  ITEM_COMPLETED,
  ITEM_STARTED,
  REASONING_TEXT_DELTA,
  REQ_COMMAND_APPROVAL,
  REQ_FILECHANGE_APPROVAL,
  THREAD_STARTED,
  TOKEN_USAGE_UPDATED,
  TURN_COMPLETED,
  TURN_STARTED,
} from "./protocol"

describe("codex protocol constants (pinned to 0.130.0)", () => {
  it("uses the exact app-server method strings", () => {
    expect(THREAD_STARTED).toBe("thread/started")
    expect(TURN_STARTED).toBe("turn/started")
    expect(TURN_COMPLETED).toBe("turn/completed")
    expect(ITEM_STARTED).toBe("item/started")
    expect(ITEM_COMPLETED).toBe("item/completed")
    expect(AGENT_MESSAGE_DELTA).toBe("item/agentMessage/delta")
    expect(REASONING_TEXT_DELTA).toBe("item/reasoning/textDelta")
    expect(COMMAND_OUTPUT_DELTA).toBe("item/commandExecution/outputDelta")
    expect(TOKEN_USAGE_UPDATED).toBe("thread/tokenUsage/updated")
    expect(ERROR_NOTIFICATION).toBe("error")
    expect(REQ_COMMAND_APPROVAL).toBe("item/commandExecution/requestApproval")
    expect(REQ_FILECHANGE_APPROVAL).toBe("item/fileChange/requestApproval")
  })
})
