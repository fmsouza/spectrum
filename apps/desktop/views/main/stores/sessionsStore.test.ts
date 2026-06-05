import { describe, expect, it, mock } from "bun:test"
import type { Session } from "@launchkit/types"
import { createFakeIpcClient } from "../test/fake-client"
import { createSessionsStore } from "./sessionsStore"

const running = {
  id: "s_1",
  harnessId: "claude",
  modelId: "m_1",
  startedAt: "2026-01-01T00:00:00.000Z",
} as unknown as Session
const ended = {
  ...running,
  id: "s_0",
  endedAt: "2026-01-01T00:05:00.000Z",
  exitCode: 0,
} as unknown as Session

describe("createSessionsStore", () => {
  it("fetches running and recent with the right filters", async () => {
    const client = createFakeIpcClient({
      getSessions: async (params) => ({
        ok: true,
        value: params?.running === true ? [running] : [ended],
      }),
    })
    const store = createSessionsStore({ client })
    await store.getState().fetchRunning()
    await store.getState().fetchRecent()
    expect(store.getState().running).toEqual([running])
    expect(store.getState().recent).toEqual([ended])
    expect(client.calls.getSessions).toContainEqual({ running: true })
    expect(client.calls.getSessions).toContainEqual({
      running: false,
      limit: 20,
    })
  })

  it("setRecentLimit re-queries recent with the new limit", async () => {
    const client = createFakeIpcClient({
      getSessions: async () => ({ ok: true as const, value: [] }),
    })
    const store = createSessionsStore({ client })
    await store.getState().fetchRecent()
    store.getState().setRecentLimit(40)
    await Promise.resolve()
    expect(client.calls.getSessions).toContainEqual({
      running: false,
      limit: 40,
    })
  })

  it("invalidate refetches both groups", async () => {
    const getSessions = mock(async () => ({ ok: true as const, value: [] }))
    const store = createSessionsStore({
      client: createFakeIpcClient({ getSessions }),
    })
    await store.getState().fetchRunning()
    await store.getState().fetchRecent()
    const before = getSessions.mock.calls.length
    await store.getState().invalidate()
    expect(getSessions.mock.calls.length).toBe(before + 2)
  })

  it("launch calls launchHarness then invalidates and returns the result", async () => {
    const getSessions = mock(async () => ({ ok: true as const, value: [] }))
    const client = createFakeIpcClient({
      getSessions,
      launchHarness: async () => ({
        ok: true as const,
        value: { sessionId: "s_new" },
      }),
    })
    const store = createSessionsStore({ client })
    await store.getState().fetchRunning()
    await store.getState().fetchRecent()
    const before = getSessions.mock.calls.length
    const r = await store.getState().launch({ id: "claude" })
    expect(r.ok && r.value.sessionId).toBe("s_new")
    expect(getSessions.mock.calls.length).toBe(before + 2)
  })
})
