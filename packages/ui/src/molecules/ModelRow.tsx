import type { ReactElement } from "react"
import { Button } from "../atoms/Button"

export type ModelRowProps = {
  readonly id: string
  readonly provider: string
  readonly model: string
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
}

export const ModelRow = ({
  id,
  provider,
  model,
  onEdit,
  onDelete,
}: ModelRowProps): ReactElement => (
  <tr>
    <td>{provider}</td>
    <td>{model}</td>
    <td className="lk-cell-actions">
      <Button variant="secondary" onClick={() => onEdit(id)}>
        Edit
      </Button>
      <Button variant="danger" onClick={() => onDelete(id)}>
        Delete
      </Button>
    </td>
  </tr>
)
