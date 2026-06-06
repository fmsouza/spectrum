import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { TextInput } from "../atoms/TextInput"
import { Row } from "../primitives/Row"

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
  <Row gap={2} className="lk-folder-field">
    <TextInput id={id} value={value} onChange={onChange} />
    <Button variant="secondary" onClick={() => onBrowse()}>
      Browse…
    </Button>
  </Row>
)
