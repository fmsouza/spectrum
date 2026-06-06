import type { Profile, ProfileId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { EmptyState } from "../molecules/EmptyState"

export type ProfileListProps = {
  readonly profiles: readonly Profile[]
  readonly onEdit: (profile: Profile) => void
  readonly onDelete: (id: ProfileId) => void
}

export const ProfileList = ({
  profiles,
  onEdit,
  onDelete,
}: ProfileListProps): ReactElement => {
  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No profiles yet"
        hint="Save a launch configuration as a profile to reuse it."
      />
    )
  }
  return (
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
            <td className="lk-cell-actions">
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
  )
}
