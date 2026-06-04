import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import type { SessionId } from "@launchkit/types"
import { TerminalPane, type XtermInstance } from "./TerminalPane"
import type { TerminalClient } from "./terminalClient"

const fakeClient = (calls: string[]): TerminalClient =>
  ({
    onData: () => calls.push("onData"),
    onExit: () => calls.push("onExit"),
    sendInput: () => calls.push("sendInput"),
    sendResize: () => calls.push("sendResize"),
    attach: () => calls.push("attach"),
    kill: () => calls.push("kill"),
    dispatch: () => {},
  }) as unknown as TerminalClient

describe("TerminalPane replay mode", () => {
  it("writes the provided bytes once and does not wire onData or attach in replay mode", () => {
    const writes: Array<string | Uint8Array> = []
    let wiredOnData = false
    const term: XtermInstance = {
      open: () => {},
      write: (d) => writes.push(d),
      onData: () => {
        wiredOnData = true
      },
      fit: () => ({ cols: 80, rows: 24 }),
      cols: 80,
      rows: 24,
      dispose: () => {},
    }
    const calls: string[] = []
    const bytes = new Uint8Array([1, 2, 3])

    render(
      <TerminalPane
        mode="replay"
        sessionId={"s_1" as SessionId}
        client={fakeClient(calls)}
        createTerminal={() => term}
        bytes={bytes}
      />,
    )

    expect(writes).toContainEqual(bytes)
    expect(wiredOnData).toBe(false)
    expect(calls).not.toContain("attach")
    expect(calls).not.toContain("sendInput")
    expect(calls).not.toContain("onData")
  })

  it("wires the live stream and attaches in live mode (default)", () => {
    const term: XtermInstance = {
      open: () => {},
      write: () => {},
      onData: () => {},
      fit: () => ({ cols: 80, rows: 24 }),
      cols: 80,
      rows: 24,
      dispose: () => {},
    }
    const calls: string[] = []
    render(
      <TerminalPane
        mode="live"
        sessionId={"s_1" as SessionId}
        client={fakeClient(calls)}
        createTerminal={() => term}
      />,
    )
    expect(calls).toContain("onData")
  })
})
