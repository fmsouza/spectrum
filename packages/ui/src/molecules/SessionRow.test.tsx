import { describe, expect, it, mock } from "bun:test"
import type { Session } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionRow } from "./SessionRow"

const running = {
  id: "s_1",
  harnessId: "claude",
  alias: "default",
  startedAt: "2026-06-04T11:59:30.000Z",
  name: "Refactor auth",
  cwd: "/Users/fred/app",
} as unknown as Session

const exited = {
  id: "s_2",
  harnessId: "codex",
  alias: "fast",
  startedAt: "2026-06-03T10:00:00.000Z",
  endedAt: "2026-06-03T10:05:00.000Z",
  exitCode: 1,
  cwd: "/Users/fred/other",
} as unknown as Session

describe("SessionRow", () => {
  it("shows the session name when present", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("Refactor auth")).toBeInTheDocument()
  })
  it("falls back to the session id when there is no name", () => {
    render(
      <SessionRow
        session={exited}
        harnessName="Codex"
        model="gpt"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("s_2")).toBeInTheDocument()
  })
  it("shows a running badge when the session has not ended", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("running")).toBeInTheDocument()
  })
  it("shows the exit code with a danger tone for a non-zero exit", () => {
    render(
      <SessionRow
        session={exited}
        harnessName="Codex"
        model="gpt"
        selected={false}
        onSelect={() => {}}
      />,
    )
    const badge = screen.getByText("exit 1")
    expect(badge).toHaveAttribute("data-tone", "danger")
  })
  it("renders harness name and model on the second line", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText("Claude Code · sonnet")).toBeInTheDocument()
  })
  it("renders the cwd and a relative start time on the third line", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("session-row-meta").textContent).toContain(
      "/Users/fred/app",
    )
    expect(screen.getByTestId("session-row-meta").textContent).toMatch(
      /just now|ago/,
    )
  })
  it("marks itself pressed when selected", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true")
  })
  it("calls onSelect when the row is clicked", () => {
    const onSelect = mock(() => {})
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
