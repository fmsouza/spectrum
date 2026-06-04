import { describe, expect, it, mock } from "bun:test"
import type { HarnessDefinition, ModelAlias } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileForm } from "./ProfileForm"
import type { ProfileFormValues } from "./ProfileForm"

const harnesses = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as unknown as readonly HarnessDefinition[]

const aliases = [
  { alias: "default", providerId: "p1", providerModel: "sonnet" },
  { alias: "fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelAlias[]

const initial = {
  name: "Sonnet default",
  harnessId: "claude",
  alias: "default",
  env: { ANTHROPIC_MODEL: "sonnet" },
} as unknown as ProfileFormValues

describe("ProfileForm", () => {
  it("seeds the fields from the initial values", () => {
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText("Name")).toHaveValue("Sonnet default")
    expect(screen.getByLabelText("Harness")).toHaveValue("claude")
    expect(screen.getByLabelText("Alias")).toHaveValue("default")
  })
  it("submits the edited values, preserving env, when saved", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    })
    fireEvent.change(screen.getByLabelText("Alias"), {
      target: { value: "fast" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Renamed",
      harnessId: "claude",
      alias: "fast",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("does not submit when the name is empty", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = mock(() => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        aliases={aliases}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
