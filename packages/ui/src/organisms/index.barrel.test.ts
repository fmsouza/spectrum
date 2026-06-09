import { describe, expect, it } from "bun:test"
import { ConversationTimeline, RunView, SubRunnerPane } from "./index"

describe("organisms barrel", () => {
  it("re-exports the conversation organisms", () => {
    expect(typeof ConversationTimeline).toBe("function")
    expect(typeof SubRunnerPane).toBe("function")
    expect(typeof RunView).toBe("function")
  })
})
