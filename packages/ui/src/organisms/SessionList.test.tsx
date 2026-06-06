import { describe, expect, it, mock } from "bun:test"
import type { Session, SessionId } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { SessionList } from "./SessionList"

const running = [
  {
    id: "s_run",
    harnessId: "claude",
    alias: "default",
    startedAt: "2026-06-04T11:59:30.000Z",
    name: "Live run",
    cwd: "/Users/fred/app",
  },
] as unknown as readonly Session[]

const recent = [
  {
    id: "s_old",
    harnessId: "codex",
    alias: "fast",
    startedAt: "2026-06-03T10:00:00.000Z",
    endedAt: "2026-06-03T10:05:00.000Z",
    exitCode: 0,
    name: "Past run",
    cwd: "/Users/fred/other",
  },
] as unknown as readonly Session[]

const labelFor = (): { harnessName: string; model: string } => ({
  harnessName: "Harness",
  model: "model",
})

describe("SessionList", () => {
  it("renders a New session button that calls onNew when clicked", () => {
    const onNew = mock(() => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={onNew}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /new session/i }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
  it("renders Running and Recent group headings", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(
      screen.getByRole("heading", { name: /running/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /recent/i })).toBeInTheDocument()
  })
  it("renders a row for each running and recent session", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(screen.getByText("Live run")).toBeInTheDocument()
    expect(screen.getByText("Past run")).toBeInTheDocument()
  })
  it("calls onSelect with the session id when a row is clicked", () => {
    const onSelect = mock((_id: SessionId) => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={onSelect}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    fireEvent.click(screen.getByText("Live run"))
    expect(onSelect).toHaveBeenCalledWith("s_run")
  })
  it("does not render a View more button when hasMore is false", () => {
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore={false}
        onSelect={() => {}}
        onMore={() => {}}
        onNew={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: /view more/i })).toBeNull()
  })
  it("renders a View more button that calls onMore when hasMore is true", () => {
    const onMore = mock(() => {})
    render(
      <SessionList
        running={running}
        recent={recent}
        labelFor={labelFor}
        hasMore
        onSelect={() => {}}
        onMore={onMore}
        onNew={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /view more/i }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it("marks the list container and group sections with hooks", () => {
    const { container } = render(
      <SessionList running={[]} recent={[]} labelFor={() => ({ harnessName: "h", model: "m" })}
        hasMore={false} onSelect={() => {}} onMore={() => {}} onNew={() => {}} />,
    )
    expect(container.querySelector(".lk-session-list")).not.toBeNull()
  })
})
