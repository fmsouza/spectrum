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
  it("shows a neutral-tone ended badge when exitCode is undefined (Fix 6)", () => {
    const ended = {
      id: "s_3",
      harnessId: "claude",
      alias: "default",
      startedAt: "2026-06-04T10:00:00.000Z",
      endedAt: "2026-06-04T10:05:00.000Z",
      cwd: "/tmp",
    } as unknown as Session
    render(
      <SessionRow
        session={ended}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    const badge = screen.getByText("ended")
    expect(badge).toHaveAttribute("data-tone", "neutral")
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

  it("wraps the name (and only the name) in the truncating hook", () => {
    const { container } = render(
      <SessionRow
        session={running}
        harnessName="claude"
        model="default"
        selected={false}
        onSelect={() => {}}
      />,
    )
    // the line-1 wrapper carries the hook; the dot and badge are NOT truncated
    expect(container.querySelector(".lk-session-row__line")).not.toBeNull()
    const name = container.querySelector(".lk-session-row__name.lk-truncate")
    expect(name).not.toBeNull()
    expect(container.querySelectorAll(".lk-truncate").length).toBe(1)
    // StatusDot and Badge are siblings of — NOT inside — the Truncate element
    expect(container.querySelector(".lk-truncate [role='img']")).toBeNull()
    expect(container.querySelector(".lk-truncate [data-tone]")).toBeNull()
    // StatusDot (role=img) is a direct child of line-1
    expect(
      container.querySelector(".lk-session-row__line > [role='img']"),
    ).not.toBeNull()
  })
})
