import { describe, expect, it, mock } from "bun:test"
import type { HarnessDefinition, ModelAlias, Profile } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { NewSessionModal } from "./NewSessionModal"
import type { NewSessionValues } from "./NewSessionModal"

const profiles = [
  {
    id: "prof_a",
    name: "Sonnet default",
    harnessId: "claude",
    alias: "default",
    env: { ANTHROPIC_MODEL: "sonnet" },
  },
] as unknown as readonly Profile[]

const harnesses = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as unknown as readonly HarnessDefinition[]

const aliases = [
  { alias: "default", providerId: "p1", providerModel: "sonnet" },
  { alias: "fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelAlias[]

const baseProps = {
  open: true,
  profiles,
  harnesses,
  aliases,
  folder: "/Users/fred/app",
  onBrowse: () => {},
  onSubmit: () => {},
  onCancel: () => {},
}

describe("NewSessionModal", () => {
  it("does not render when closed", () => {
    render(<NewSessionModal {...baseProps} open={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("prefills harness, alias, and env when a profile is selected", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Profile"), {
      target: { value: "prof_a" },
    })
    expect(screen.getByLabelText("Harness")).toHaveValue("claude")
    expect(screen.getByLabelText("Alias")).toHaveValue("default")
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 1" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 1",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "default",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("keeps fields editable after a profile prefill", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Profile"), {
      target: { value: "prof_a" },
    })
    fireEvent.change(screen.getByLabelText("Alias"), {
      target: { value: "fast" },
    })
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 2" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 2",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "fast",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("includes saveAsProfile when the save checkbox is checked", () => {
    const onSubmit = mock((_v: NewSessionValues) => {})
    render(<NewSessionModal {...baseProps} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Run 3" },
    })
    fireEvent.click(screen.getByLabelText(/save edits as new profile/i))
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "My profile" },
    })
    fireEvent.click(screen.getByRole("button", { name: /launch/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run 3",
      cwd: "/Users/fred/app",
      harnessId: "claude",
      alias: "default",
      env: {},
      saveAsProfile: { name: "My profile" },
    })
  })
  it("calls onBrowse when the folder Browse button is clicked", () => {
    const onBrowse = mock(() => {})
    render(<NewSessionModal {...baseProps} onBrowse={onBrowse} />)
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = mock(() => {})
    render(<NewSessionModal {...baseProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("syncs folder input when folder prop changes (Fix 1)", () => {
    const { rerender } = render(<NewSessionModal {...baseProps} folder="/a" />)
    expect(screen.getByRole("textbox", { name: /folder/i })).toHaveValue("/a")
    rerender(<NewSessionModal {...baseProps} folder="/b" />)
    expect(screen.getByRole("textbox", { name: /folder/i })).toHaveValue("/b")
  })

  it("resets form state when modal is reopened (Fix 3)", () => {
    const { rerender } = render(<NewSessionModal {...baseProps} open />)
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Old name" },
    })
    rerender(<NewSessionModal {...baseProps} open={false} />)
    rerender(<NewSessionModal {...baseProps} open />)
    expect(screen.getByLabelText("Name")).toHaveValue("")
  })
})
