import { describe, expect, it, mock } from "bun:test"
import type { Profile, ProfileId } from "@launchkit/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { ProfileList } from "./ProfileList"

const profiles = [
  {
    id: "prof_a",
    name: "Sonnet default",
    harnessId: "claude",
    alias: "default",
    env: {},
  },
  {
    id: "prof_b",
    name: "Fast codex",
    harnessId: "codex",
    alias: "fast",
    env: {},
  },
] as unknown as readonly Profile[]

describe("ProfileList", () => {
  it("shows an empty state when there are no profiles", () => {
    render(
      <ProfileList
        profiles={[]}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(
      screen.getByRole("heading", { name: /no profiles/i }),
    ).toBeInTheDocument()
  })
  it("renders a row per profile showing its name", () => {
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByText("Sonnet default")).toBeInTheDocument()
    expect(screen.getByText("Fast codex")).toBeInTheDocument()
  })
  it("calls onAdd when the add button is clicked", () => {
    const onAdd = mock(() => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={onAdd}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
  it("calls onEdit with the profile when its edit button is clicked", () => {
    const onEdit = mock((_p: Profile) => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={onEdit}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0])
    expect(onEdit).toHaveBeenCalledWith(profiles[0])
  })
  it("calls onDelete with the profile id when its delete button is clicked", () => {
    const onDelete = mock((_id: ProfileId) => {})
    render(
      <ProfileList
        profiles={profiles}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[1])
    expect(onDelete).toHaveBeenCalledWith("prof_b")
  })
})
