import { describe, expect, it } from "bun:test"
import type { SessionId } from "@launchkit/types"
import { SessionIdSchema } from "@launchkit/types"
import { render, screen } from "@testing-library/react"
import { TerminalPage } from "./TerminalPage"
import type { XtermInstance } from "./TerminalPane"
import { createTerminalClient } from "./terminalClient"

const id = (n: number): SessionId =>
  SessionIdSchema.parse(`s_0000000${n}-0000-4000-8000-000000000000`)

const fakeClient = () => createTerminalClient(() => {})

// A no-op xterm stand-in so panes mount without a real terminal under happy-dom.
const fakeTerminal = (): XtermInstance => ({
  open: () => {},
  write: () => {},
  onData: () => {},
  fit: () => {},
  cols: 80,
  rows: 24,
  dispose: () => {},
})

describe("TerminalPage", () => {
  it("shows the empty state when there are no tabs", () => {
    render(
      <TerminalPage
        client={fakeClient()}
        tabs={[]}
        closeTab={() => {}}
        createTerminal={fakeTerminal}
      />,
    )
    expect(screen.getByText(/no terminal sessions/i)).toBeInTheDocument()
  })

  it("renders the tab strip with a tab per session when there are tabs", () => {
    render(
      <TerminalPage
        client={fakeClient()}
        tabs={[id(1), id(2)]}
        closeTab={() => {}}
        createTerminal={fakeTerminal}
      />,
    )
    expect(screen.getAllByRole("tab")).toHaveLength(2)
  })

  it("labels tabs from the provided label map", () => {
    render(
      <TerminalPage
        client={fakeClient()}
        tabs={[id(1)]}
        labels={{ [id(1)]: "claude" }}
        closeTab={() => {}}
        createTerminal={fakeTerminal}
      />,
    )
    expect(screen.getByRole("tab")).toHaveTextContent("claude")
  })
})
