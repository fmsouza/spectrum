import { describe, expect, it } from "bun:test"
import type { RunnerOutbound } from "@spectrum/agent-driver"
import type { CanonicalEvent, StoredEvent } from "@spectrum/agent-events"
import {
  type HarnessId,
  type ModelRoute,
  type SessionId,
  SessionIdSchema,
} from "@spectrum/types"
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
  readonly setModes: Array<{ id: SessionId; mode: string }>
  readonly setModels: Array<{ id: SessionId; modelId: string }>
  push: (event: StoredEvent) => void
} => {
  let listener: ((event: StoredEvent) => void) | undefined
  const attached: SessionId[] = []
  const sends: string[] = []
  const setModes: Array<{ id: SessionId; mode: string }> = []
  const setModels: Array<{ id: SessionId; modelId: string }> = []
  return {
    attached,
    sends,
    setModes,
    setModels,
    attach: (sid) => attached.push(sid),
    send: (_sid, text) => sends.push(text),
    approve: () => {},
    interrupt: () => {},
    setMode: (sid, mode) => setModes.push({ id: sid, mode }),
    setModel: (sid, modelId) =>
      setModels.push({ id: sid, modelId: String(modelId) }),
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

  it("shows stop button while busy and clicking it calls interrupt", async () => {
    const interrupted: SessionId[] = []
    const base = makeFakeRunner()
    const runner: typeof base = {
      ...base,
      interrupt: (sid) => interrupted.push(sid),
    }
    renderWithProviders(
      <RunDetail mode="live" sessionId={id} runnerClient={runner} />,
      createFakeIpcClient({}),
    )
    runner.push(
      stored(0, { type: "runner-started", runnerId: "run_root" as never }),
    )
    // A user text-delta sets busy=true in the runViewStore
    runner.push(
      stored(1, {
        type: "text-delta",
        runnerId: "run_root" as never,
        messageId: "m1",
        text: "Hello",
        role: "user",
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Stop run" }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: "Stop run" }))
    expect(interrupted).toEqual([id])
    cleanup()
  })

  it("renders the mode selector pill and calls runnerClient.setMode on pick", async () => {
    const runner = makeFakeRunner()
    renderWithProviders(
      <RunDetail mode="live" sessionId={id} runnerClient={runner} />,
      createFakeIpcClient({}),
    )
    runner.push(
      stored(0, {
        type: "runner-started",
        runnerId: "run_root" as never,
        supportedModes: ["manual", "bypass"],
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /manual approval/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /bypass permissions/i }),
    )
    expect(runner.setModes).toEqual([{ id, mode: "bypass" }])
    cleanup()
  })

  it("persists the picked mode per-harness via updateHarnessPrefs", async () => {
    const runner = makeFakeRunner()
    const prefsCalls: Array<{ harnessId: string; mode?: string }> = []
    const client = createFakeIpcClient({
      updateHarnessPrefs: async (p: { harnessId: string; mode?: string }) => {
        prefsCalls.push(p)
        return { ok: true, value: null }
      },
    })
    renderWithProviders(
      <RunDetail
        mode="live"
        sessionId={id}
        runnerClient={runner}
        harnessId={"claude" as HarnessId}
      />,
      client,
    )
    runner.push(
      stored(0, {
        type: "runner-started",
        runnerId: "run_root" as never,
        supportedModes: ["manual", "bypass"],
      }),
    )
    await waitFor(() =>
      screen.getByRole("button", { name: /manual approval/i }),
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /bypass permissions/i }),
    )
    expect(prefsCalls).toEqual([{ harnessId: "claude", mode: "bypass" }])
    expect(runner.setModes).toEqual([{ id, mode: "bypass" }])
    cleanup()
  })

  it("renders the model selector pill and calls runnerClient.setModel on pick", async () => {
    const runner = makeFakeRunner()
    const models = [
      { id: "mdl_a", providerId: "p1", providerModel: "sonnet" },
      { id: "mdl_b", providerId: "p1", providerModel: "haiku" },
    ] as readonly ModelRoute[]
    const providerNames: Readonly<Record<string, string>> = { p1: "Anthropic" }
    renderWithProviders(
      <RunDetail
        mode="live"
        sessionId={id}
        runnerClient={runner}
        models={models}
        providerNames={providerNames}
      />,
      createFakeIpcClient({}),
    )
    runner.push(
      stored(0, {
        type: "runner-started",
        runnerId: "run_root" as never,
        model: "mdl_a",
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Anthropic \/ sonnet/i }),
      ).toBeInTheDocument(),
    )
    fireEvent.click(
      screen.getByRole("button", { name: /Anthropic \/ sonnet/i }),
    )
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Anthropic \/ haiku/i }),
    )
    expect(runner.setModels).toEqual([{ id, modelId: "mdl_b" }])
    cleanup()
  })

  it("persists the picked model per-harness via updateHarnessPrefs", async () => {
    const runner = makeFakeRunner()
    const models = [
      { id: "mdl_a", providerId: "p1", providerModel: "sonnet" },
      { id: "mdl_b", providerId: "p1", providerModel: "haiku" },
    ] as readonly ModelRoute[]
    const providerNames: Readonly<Record<string, string>> = { p1: "Anthropic" }
    const prefsCalls: Array<{
      harnessId: string
      mode?: string
      modelId?: string
    }> = []
    const client = createFakeIpcClient({
      updateHarnessPrefs: async (p: {
        harnessId: string
        mode?: string
        modelId?: string
      }) => {
        prefsCalls.push(p)
        return { ok: true, value: null }
      },
    })
    renderWithProviders(
      <RunDetail
        mode="live"
        sessionId={id}
        runnerClient={runner}
        harnessId={"claude" as HarnessId}
        models={models}
        providerNames={providerNames}
      />,
      client,
    )
    runner.push(
      stored(0, {
        type: "runner-started",
        runnerId: "run_root" as never,
        model: "mdl_a",
      }),
    )
    await waitFor(() =>
      screen.getByRole("button", { name: /Anthropic \/ sonnet/i }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: /Anthropic \/ sonnet/i }),
    )
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Anthropic \/ haiku/i }),
    )
    expect(prefsCalls).toEqual([{ harnessId: "claude", modelId: "mdl_b" }])
    expect(runner.setModels).toEqual([{ id, modelId: "mdl_b" }])
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
