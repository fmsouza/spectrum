export type RunFinished = {
  readonly sessionId: string
  readonly harnessId: string
  readonly status: "completed" | "errored"
  readonly cwd?: string
}

export interface NotificationService {
  /** Fire a native notification for an important run event iff the window is unfocused. */
  onRunFinished(event: RunFinished): void
}

/**
 * Native OS notification service. `showNotification` + `isWindowFocused` are injected seams
 * (production lazy-imports Electrobun `Utils.showNotification` and reads a window focus flag);
 * tests inject fakes. Only fires when the window is NOT focused (the in-app toast covers focused).
 */
export const createNotificationService = (deps: {
  readonly showNotification: (n: { title: string; body: string }) => void
  readonly isWindowFocused: () => boolean
}): NotificationService => ({
  onRunFinished: (event) => {
    if (deps.isWindowFocused()) return
    const title = event.status === "errored" ? "Run failed" : "Run finished"
    const body =
      event.cwd !== undefined && event.cwd !== ""
        ? `${event.harnessId} · ${event.cwd}`
        : event.harnessId
    deps.showNotification({ title, body })
  },
})
