import { describe, expect, it, mock } from "bun:test"
import type { Profile, ProfileId } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileList } from "./ProfileList"

const profiles = [
  {
    id: "prof_a",
    name: "Sonnet default",
    harnessId: "claude",
    env: {},
  },
  {
    id: "prof_b",
    name: "Fast codex",
    harnessId: "codex",
    modelId: "m_fast",
    env: {},
  },
] as unknown as readonly Profile[]

describe("ProfileList", () => {
  it("renders a table (not a ul list) so lk-list hooks are not applied", () => {
    const { container } = render(
      <ProfileList profiles={profiles} onEdit={() => {}} onDelete={() => {}} />,
    )
    // ProfileList is purely table-structured; it is styled by tag rules in lists.css
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelector("ul")).toBeNull()
  })
  it("actions cell carries lk-cell-actions class for flex/gap layout", () => {
    const { container } = render(
      <ProfileList profiles={profiles} onEdit={() => {}} onDelete={() => {}} />,
    )
    expect(container.querySelector("td.lk-cell-actions")).not.toBeNull()
  })
  it("shows an empty state when there are no profiles", () => {
    render(<ProfileList profiles={[]} onEdit={() => {}} onDelete={() => {}} />)
    expect(
      screen.getByRole("heading", { name: /no profiles/i }),
    ).toBeInTheDocument()
  })
  it("renders a row per profile showing its name", () => {
    render(
      <ProfileList profiles={profiles} onEdit={() => {}} onDelete={() => {}} />,
    )
    expect(screen.getByText("Sonnet default")).toBeInTheDocument()
    expect(screen.getByText("Fast codex")).toBeInTheDocument()
  })
  it("shows a Model column and renders default when no modelId is set", () => {
    render(
      <ProfileList profiles={profiles} onEdit={() => {}} onDelete={() => {}} />,
    )
    expect(
      screen.getByRole("columnheader", { name: "Model" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("columnheader", { name: "Alias" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("default")).toBeInTheDocument()
    expect(screen.getByText("m_fast")).toBeInTheDocument()
  })
  it("calls onEdit with the profile when its edit button is clicked", () => {
    const onEdit = mock((_p: Profile) => {})
    render(
      <ProfileList profiles={profiles} onEdit={onEdit} onDelete={() => {}} />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0])
    expect(onEdit).toHaveBeenCalledWith(profiles[0])
  })

  it("calls onDelete with the profile id when its delete button is clicked", () => {
    const onDelete = mock((_id: ProfileId) => {})
    render(
      <ProfileList profiles={profiles} onEdit={() => {}} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[1])
    expect(onDelete).toHaveBeenCalledWith("prof_b")
  })
})
