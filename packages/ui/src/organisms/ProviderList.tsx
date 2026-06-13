import type { ReactElement } from "react"
import { Badge } from "../atoms/Badge"
import { Button } from "../atoms/Button"
import { EmptyState } from "../molecules/EmptyState"

export type ProviderRow = {
  readonly id: string
  readonly name: string
  readonly sdkProvider: string
  /** Whether the provider's secret(s) are configured. */
  readonly secretSet: boolean
}

export type ProviderListProps = {
  readonly providers: readonly ProviderRow[]
  readonly onSetSecret: (providerId: string) => void
  readonly onEdit: (providerId: string) => void
}

export const ProviderList = ({
  providers,
  onSetSecret,
  onEdit,
}: ProviderListProps): ReactElement => {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="No providers yet"
        hint="Add a provider to start routing models."
      />
    )
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Provider</th>
          <th>SDK</th>
          <th>API key</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>
              <Badge tone="info">{p.sdkProvider}</Badge>
            </td>
            <td>
              <Badge tone={p.secretSet ? "success" : "neutral"}>
                {p.secretSet ? "Set" : "Not set"}
              </Badge>
            </td>
            <td className="lk-cell-actions">
              <Button variant="secondary" onClick={() => onEdit(p.id)}>
                Edit
              </Button>
              <Button variant="secondary" onClick={() => onSetSecret(p.id)}>
                Set secret
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
