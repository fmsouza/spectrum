import { describe, expect, it } from "bun:test"
import type { RunnerOutbound } from "@launchkit/agent-driver"
import type { CanonicalEvent, StoredEvent } from "@launchkit/agent-events"
import { type SessionId, SessionIdSchema } from "@launchkit/types"
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { RunnerClient } from "../runner/runnerClient"
import { createFakeIpcClient } from "../test/fake-client"
import { renderWithProviders } from "../test/renderWithProviders"
import { RunDetail } from "./RunDetail"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

// A fake runner client: records attach + commands, lets the test push frames.
const makeFakeRunner = (): RunnerClient & {
  readonly attached: SessionId[]
  readonly sends: string[]
  push: (event: StoredEvent) => void
} => {
  let listener: ((event: StoredEvent) => void) | undefined
  const attached: SessionId[] = []
  const sends: string[] = []
  return {
    attached,
    sends,
    attach: (sid) => attached.push(sid),
    send: (_sid, text) => sends.push(text),
    approve: () => {},
    interrupt: () => {},
    dispatch: (_m: RunnerOutbound) => {},
    onEvent: (_sid, cb) => {
      listener = cb
    },
    push: (event) => listener?.(event),
  }
}

const stored = (seq: number, event: CanonicalEvent): StoredEvent => ({
  seq,
  sessionId: id,
  ts: "2026-06-08T10:00:00.000Z",
  event,
})

describe("RunDetail (live)", () => {
  it("attaches the runner socket on mount", () => {
    const runner = makeFakeRunner()
    renderWithProviders(
      <RunDetail mode="live" sessionId={id} runnerClient={runner} />,
      createFakeIpcClient({}),
    )
    expect(runner.attached).toEqual([id])
    cleanup()
  })

  it("renders reduced events pushed over the socket", async () => {
    const runner = makeFakeRunner()
    renderWithProviders(
      <RunDetail mode="live" sessionId={id} runnerClient={runner} />,
      createFakeIpcClient({}),
    )
    runner.push(
      stored(0, { type: "runner-started", runnerId: "run_root" as never }),
    )
    runner.push(
      stored(1, {
        type: "text-delta",
        runnerId: "run_root" as never,
        messageId: "m1",
        text: "Hello from the agent",
      }),
    )
    await waitFor(() =>
      expect(screen.getByText("Hello from the agent")).toBeInTheDocument(),
    )
    cleanup()
  })

  it("forwards a composer turn over the runner socket", async () => {
    const runner = makeFakeRunner()
    renderWithProviders(
      <RunDetail mode="live" sessionId={id} runnerClient={runner} />,
      createFakeIpcClient({}),
    )
    runner.push(
      stored(0, { type: "runner-started", runnerId: "run_root" as never }),
    )
    await waitFor(() => screen.getByRole("button", { name: "Send message" }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(runner.sends).toEqual(["go"])
    cleanup()
  })
})

describe("RunDetail (replay)", () => {
  it("folds getRunEvents into a read-only timeline with a disabled composer", async () => {
    const runner = makeFakeRunner()
    const client = createFakeIpcClient({
      getRunEvents: async () => ({
        ok: true,
        value: {
          events: [
            stored(0, {
              type: "runner-started",
              runnerId: "run_root" as never,
            }),
            stored(1, {
              type: "text-delta",
              runnerId: "run_root" as never,
              messageId: "m1",
              text: "Recorded reply",
            }),
          ],
        },
      }),
    })
    renderWithProviders(
      <RunDetail mode="replay" sessionId={id} runnerClient={runner} />,
      client,
    )
    await waitFor(() =>
      expect(screen.getByText("Recorded reply")).toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
    expect(runner.attached).toEqual([]) // replay never attaches the socket
    cleanup()
  })
})
