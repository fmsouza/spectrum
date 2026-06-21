import { describe, expect, it, mock } from "bun:test"
import type { AppContext } from "../composition"
import { openWindow } from "./window"
import type { OpenWindowDeps, WindowOptions } from "./window"
import type { WindowBounds } from "./window-bounds"
import type { WindowBoundsIO } from "./window-bounds-io"

const fakeCtx = {} as AppContext

const fakeIO = (): WindowBoundsIO => ({
  loadInitialFrame: async (): Promise<WindowBounds> => ({
    width: 1024,
    height: 720,
    x: 100,
    y: 100,
  }),
  onBoundsChange: () => {},
})

const makeDeps = (
  over: Partial<OpenWindowDeps> = {},
): {
  deps: OpenWindowDeps
  created: WindowOptions[]
  serverWired: number
} => {
  const created: WindowOptions[] = []
  let serverWired = 0
  const deps: OpenWindowDeps = {
    createWindow: mock((opts: WindowOptions) => {
      created.push(opts)
      return { id: 1 }
    }),
    makeTransport: mock(() => ({ onRequest: () => {} })),
    wireServer: mock(() => {
      serverWired += 1
    }),
    createBoundsIO: mock(() => fakeIO()),
    viewUrl: "views://main/index.html",
    ...over,
  }
  return { deps, created, serverWired }
}

describe("openWindow", () => {
  it("creates a window pointed at the built views/main entry when called", () => {
    const { deps, created } = makeDeps()
    openWindow(fakeCtx, deps)
    expect(created).toHaveLength(1)
    expect(created[0]?.url).toBe("views://main/index.html")
  })

  it("locks the window to the app origin and disables remote content when called", () => {
    const { deps, created } = makeDeps()
    openWindow(fakeCtx, deps)
    expect(created[0]?.lockNavigationToOrigin).toBe(true)
  })

  it("wires the IPC server over the Electrobun transport when called", () => {
    const wireServer = mock(() => {})
    const { deps } = makeDeps({ wireServer })
    openWindow(fakeCtx, deps)
    expect(wireServer).toHaveBeenCalledTimes(1)
  })

  it("builds the bounds IO from the context and threads it into the window", () => {
    const io = fakeIO()
    const createBoundsIO = mock(() => io)
    const { deps, created } = makeDeps({ createBoundsIO })
    openWindow(fakeCtx, deps)
    expect(createBoundsIO).toHaveBeenCalledTimes(1)
    expect(created[0]?.loadInitialFrame).toBe(io.loadInitialFrame)
    expect(created[0]?.onBoundsChange).toBe(io.onBoundsChange)
  })
})
