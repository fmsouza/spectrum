import { describe, expect, it, mock } from "bun:test"
import type { Session } from "@spectrum/types"
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

  it("calls onContextMenu with cursor coords when right-clicked", () => {
    const onContextMenu = mock((_e: { clientX: number; clientY: number }) => {})
    render(
      <SessionRow
        session={running}
        harnessName="claude"
        model="default"
        selected={false}
        onSelect={() => {}}
        onContextMenu={onContextMenu}
      />,
    )
    fireEvent.contextMenu(screen.getByRole("button"))
    expect(onContextMenu).toHaveBeenCalledTimes(1)
  })

  it("wraps the name (and only the name) in the truncating hook and renders no status dot", () => {
    const { container } = render(
      <SessionRow
        session={running}
        harnessName="claude"
        model="default"
        selected={false}
        onSelect={() => {}}
      />,
    )
    // the line-1 wrapper carries the hook; only the name is truncated
    expect(container.querySelector(".lk-session-row__line")).not.toBeNull()
    const name = container.querySelector(".lk-session-row__name.lk-truncate")
    expect(name).not.toBeNull()
    expect(container.querySelectorAll(".lk-truncate").length).toBe(1)
    // The redundant StatusDot is gone — the Badge is the only status signal.
    expect(container.querySelector("[role='img']")).toBeNull()
    // The Badge still conveys the state.
    expect(container.querySelector("[data-tone]")).not.toBeNull()
  })
})

describe("SessionRow rename", () => {
  it("renders the session name when not editing", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
        onRename={() => {}}
      />,
    )
    expect(screen.getByText("Refactor auth")).toBeInTheDocument()
  })

  it("falls back to the session id when name is absent", () => {
    render(
      <SessionRow
        session={exited}
        harnessName="Codex"
        model="gpt"
        selected={false}
        onSelect={() => {}}
        onRename={() => {}}
      />,
    )
    expect(screen.getByText("s_2")).toBeInTheDocument()
  })

  it("does not render an editable input when onRename is absent", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("switches to a text input when the name is clicked and onRename is provided", () => {
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
        onRename={() => {}}
      />,
    )
    fireEvent.click(screen.getByText("Refactor auth"))
    expect(screen.getByRole("textbox")).toHaveValue("Refactor auth")
  })

  it("calls onRename with the trimmed new value on submit (Enter) and exits edit mode", () => {
    const onRename = mock((_name: string) => {})
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByText("Refactor auth"))
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "  New name  " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onRename).toHaveBeenCalledWith("New name")
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("Refactor auth")).toBeInTheDocument()
  })

  it("does not call onRename when the value is blank or unchanged", () => {
    const onRename = mock((_name: string) => {})
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByText("Refactor auth"))
    const input = screen.getByRole("textbox")
    // Unchanged value + Enter -> no call
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onRename).not.toHaveBeenCalled()
    // Blank value + Enter -> no call
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onRename).not.toHaveBeenCalled()
  })

  it("cancels edit on Escape without calling onRename", () => {
    const onRename = mock((_name: string) => {})
    render(
      <SessionRow
        session={running}
        harnessName="Claude Code"
        model="sonnet"
        selected={false}
        onSelect={() => {}}
        onRename={onRename}
      />,
    )
    fireEvent.click(screen.getByText("Refactor auth"))
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "discarded" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("Refactor auth")).toBeInTheDocument()
  })
})
