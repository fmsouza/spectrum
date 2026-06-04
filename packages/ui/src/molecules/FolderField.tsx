import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { TextInput } from "../atoms/TextInput"

export type FolderFieldProps = {
  readonly id: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBrowse: () => void
}

export const FolderField = ({
  id,
  value,
  onChange,
  onBrowse,
}: FolderFieldProps): ReactElement => (
  <div>
    <TextInput id={id} value={value} onChange={onChange} />
    <Button variant="secondary" onClick={() => onBrowse()}>
      Browse…
    </Button>
  </div>
)
