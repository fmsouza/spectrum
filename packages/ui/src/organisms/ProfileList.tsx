import type { Profile, ProfileId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { EmptyState } from "../molecules/EmptyState"

export type ProfileListProps = {
  readonly profiles: readonly Profile[]
  readonly onAdd: () => void
  readonly onEdit: (profile: Profile) => void
  readonly onDelete: (id: ProfileId) => void
}

export const ProfileList = ({
  profiles,
  onAdd,
  onEdit,
  onDelete,
}: ProfileListProps): ReactElement => {
  if (profiles.length === 0) {
    return (
      <div>
        <Button onClick={() => onAdd()}>Add profile</Button>
        <EmptyState
          title="No profiles yet"
          hint="Save a launch configuration as a profile to reuse it."
        />
      </div>
    )
  }
  return (
    <div>
      <Button onClick={() => onAdd()}>Add profile</Button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Harness</th>
            <th>Model</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id}>
              <td>{profile.name}</td>
              <td>{profile.harnessId}</td>
              <td>{profile.modelId ?? "default"}</td>
              <td>
                <Button variant="secondary" onClick={() => onEdit(profile)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => onDelete(profile.id)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
