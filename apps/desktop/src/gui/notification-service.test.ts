import { describe, expect, it } from "bun:test"
import { createNotificationService } from "./notification-service"

const makeDeps = (focused: boolean) => {
  const fired: Array<{ title: string; body: string }> = []
  return {
    fired,
    deps: {
      showNotification: (n: { title: string; body: string }) => fired.push(n),
      isWindowFocused: () => focused,
    },
  }
}

describe("createNotificationService.onRunFinished", () => {
  it("fires a native notification when the window is unfocused", () => {
    const { fired, deps } = makeDeps(false)
    createNotificationService(deps).onRunFinished({
      sessionId: "s",
      harnessId: "claude",
      status: "completed",
      cwd: "/x",
    })
    expect(fired.length).toBe(1)
    expect(fired[0]?.title).toBe("Run finished")
    expect(fired[0]?.body).toContain("claude")
  })

  it("stays silent when the window is focused", () => {
    const { fired, deps } = makeDeps(true)
    createNotificationService(deps).onRunFinished({
      sessionId: "s",
      harnessId: "claude",
      status: "errored",
    })
    expect(fired.length).toBe(0)
  })

  it("uses a failure title for errored runs", () => {
    const { fired, deps } = makeDeps(false)
    createNotificationService(deps).onRunFinished({
      sessionId: "s",
      harnessId: "codex",
      status: "errored",
    })
    expect(fired[0]?.title).toBe("Run failed")
  })
})
