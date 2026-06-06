import { describe, expect, it, mock } from "bun:test"
import type { HarnessDefinition, ModelRoute } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileForm } from "./ProfileForm"
import type { ProfileFormValues } from "./ProfileForm"

const harnesses = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
] as unknown as readonly HarnessDefinition[]

const models = [
  { id: "m_default", providerId: "p1", providerModel: "sonnet" },
  { id: "m_fast", providerId: "p1", providerModel: "haiku" },
] as unknown as readonly ModelRoute[]

const providerNames = { p1: "Anthropic" }

const initial = {
  name: "Sonnet default",
  harnessId: "claude",
  modelId: "m_default",
  env: { ANTHROPIC_MODEL: "sonnet" },
} as unknown as ProfileFormValues

describe("ProfileForm", () => {
  it("seeds the fields from the initial values", () => {
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
        providerNames={providerNames}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText("Name")).toHaveValue("Sonnet default")
    expect(screen.getByLabelText("Harness")).toHaveValue("claude")
    expect(screen.getByLabelText("Model")).toHaveValue("m_default")
  })
  it("offers a default option that bypasses the proxy", () => {
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
        providerNames={providerNames}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    const model = screen.getByLabelText("Model")
    expect(model).toContainHTML("default")
    expect(model).toContainHTML("Anthropic / haiku")
  })
  it("submits the edited values, preserving env, when saved", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
        providerNames={providerNames}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    })
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "m_fast" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Renamed",
      harnessId: "claude",
      modelId: "m_fast",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("omits modelId when the default option is selected", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
        providerNames={providerNames}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "" },
    })
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Sonnet default",
      harnessId: "claude",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
    // The exactOptional invariant: "default" OMITS the key, never emits modelId: undefined
    // (toHaveBeenCalledWith treats {modelId: undefined} as equal to {}, so assert key absence).
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("modelId")
  })
  it("does not submit when the name is empty", () => {
    const onSubmit = mock((_v: ProfileFormValues) => {})
    render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
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
        models={models}
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it("groups the action buttons in an lk-form-actions row", () => {
    const { container } = render(
      <ProfileForm
        initialValues={initial}
        harnesses={harnesses}
        models={models}
        providerNames={providerNames}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )
    const actions = container.querySelector(".lk-row.lk-form-actions")
    expect(actions).not.toBeNull()
    expect(actions?.querySelectorAll("button[data-variant]").length).toBe(2)
  })
})
