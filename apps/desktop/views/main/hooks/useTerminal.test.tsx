import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@spectrum/types"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { IpcClientProvider } from "../IpcClientContext"
import { StoreProvider, type Stores, useStores } from "../stores/createStores"
import { useTerminalStore } from "../stores/terminalStore"
import { createTerminalClient } from "../terminal/terminalClient"
import { createFakeIpcClient } from "../test/fake-client"
import { useTerminal } from "./useTerminal"

const sessionId = SessionIdSchema.parse(
  "s_00000000-0000-4000-8000-000000000000",
)

const fakeIpc = (cwd: string, ok = true) => ({
  resolveTerminalCwd: async () =>
    ok
      ? { ok: true, value: { cwd } }
      : { ok: false, error: { kind: "cwd-missing", path: "" } },
})

/**
 * Render the hook with the real `StoreProvider` + `IpcClientProvider` so
 * `useNotifications()` inside `useTerminal` resolves to the real
 * notifications zustand store. We capture the live store via a sibling
 * render so tests can read what `notify` actually pushed into state.
 */
const renderWithStores = (client: ReturnType<typeof createFakeIpcClient>) => {
  const storeRef: { current: Stores | undefined } = { current: undefined }
  const Capture = (): null => {
    storeRef.current = useStores()
    return null
  }
  return {
    storeRef,
    wrapper: ({ children }: { children: ReactNode }) => (
      <IpcClientProvider client={client}>
        <StoreProvider client={client}>
          <Capture />
          {children}
        </StoreProvider>
      </IpcClientProvider>
    ),
  }
}

describe("useTerminal", () => {
  it("openPane resolves cwd and sends term-open with measured cols/rows", async () => {
    useTerminalStore.setState({ sessions: {} })
    const sent: unknown[] = []
    const terminalClient = createTerminalClient((m) => sent.push(m))
    const client = createFakeIpcClient({})
    const { storeRef, wrapper } = renderWithStores(client)
    const { result } = renderHook(
      () =>
        useTerminal({
          sessionId,
          ipcClient: fakeIpc("/tmp") as never,
          terminalClient,
        }),
      { wrapper },
    )
    void storeRef
    await result.current.openPane()
    expect(sent.some((m) => (m as { type: string }).type === "term-open")).toBe(
      true,
    )
    const open = sent.find(
      (m) => (m as { type: string }).type === "term-open",
    ) as { cwd: string; cols: number; rows: number }
    expect(open.cwd).toBe("/tmp")
    expect(open.cols).toBeGreaterThan(0)
    expect(open.rows).toBeGreaterThan(0)
  })

  it("does not send term-open when resolveTerminalCwd errors and fires a notification", async () => {
    useTerminalStore.setState({ sessions: {} })
    const sent: unknown[] = []
    const terminalClient = createTerminalClient((m) => sent.push(m))
    const client = createFakeIpcClient({})
    const { storeRef, wrapper } = renderWithStores(client)
    const { result } = renderHook(
      () =>
        useTerminal({
          sessionId,
          ipcClient: fakeIpc("", false) as never,
          terminalClient,
        }),
      { wrapper },
    )
    await result.current.openPane()
    expect(sent.some((m) => (m as { type: string }).type === "term-open")).toBe(
      false,
    )
    const notifications =
      storeRef.current?.notifications.getState().notifications
    expect(notifications?.some((n) => n.message.length > 0)).toBe(true)
  })

  it("closePane does NOT send term-close (background survival)", () => {
    useTerminalStore.setState({ sessions: {} })
    const sent: unknown[] = []
    const terminalClient = createTerminalClient((m) => sent.push(m))
    const client = createFakeIpcClient({})
    const { storeRef, wrapper } = renderWithStores(client)
    const { result } = renderHook(
      () =>
        useTerminal({
          sessionId,
          ipcClient: fakeIpc("/tmp") as never,
          terminalClient,
        }),
      { wrapper },
    )
    void storeRef
    result.current.closePane()
    expect(
      sent.some((m) => (m as { type: string }).type === "term-close"),
    ).toBe(false)
  })

  it("closeTab sends term-close", async () => {
    useTerminalStore.setState({ sessions: {} })
    const sent: unknown[] = []
    const terminalClient = createTerminalClient((m) => sent.push(m))
    const client = createFakeIpcClient({})
    const { storeRef, wrapper } = renderWithStores(client)
    const { result } = renderHook(
      () =>
        useTerminal({
          sessionId,
          ipcClient: fakeIpc("/tmp") as never,
          terminalClient,
        }),
      { wrapper },
    )
    void storeRef
    await result.current.openPane()
    const s = useTerminalStore.getState().sessions[sessionId]
    const firstTab = s?.tabs[0]
    if (!firstTab) throw new Error("expected first tab")
    result.current.closeTab(firstTab.id)
    expect(
      sent.some((m) => (m as { type: string }).type === "term-close"),
    ).toBe(true)
  })
})
