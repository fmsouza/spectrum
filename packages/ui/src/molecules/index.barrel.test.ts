import { describe, expect, it } from "bun:test"
import {
  ApprovalCard,
  Composer,
  FileDiffCard,
  MessageBubble,
  ModeSelector,
  ModelSelector,
  ReasoningBlock,
  SubRunnerCard,
  ToolCallCard,
  UsageFooter,
} from "./index"

describe("molecules barrel", () => {
  it("re-exports the conversation molecules", () => {
    for (const c of [
      MessageBubble,
      ReasoningBlock,
      ToolCallCard,
      FileDiffCard,
      ApprovalCard,
      SubRunnerCard,
      UsageFooter,
      Composer,
      ModeSelector,
      ModelSelector,
    ])
      expect(typeof c).toBe("function")
  })
})
