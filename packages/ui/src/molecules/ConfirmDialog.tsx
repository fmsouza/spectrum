import { type ReactElement, useState } from "react"
import { Button } from "../atoms/Button"
import { Modal } from "../atoms/Modal"
import { Row } from "../primitives/Row"

export type ConfirmDialogProps = {
  readonly open: boolean
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  /**
   * When set, the confirm button stays disabled until the user types this exact
   * phrase — the type-to-confirm guard for high-risk actions (factory reset).
   */
  readonly confirmPhrase?: string
  readonly onConfirm: () => void
  readonly onClose: () => void
}

/**
 * A destructive-action confirmation built on `Modal`. Cancel + a danger confirm
 * button; with `confirmPhrase` it becomes type-to-confirm. Pure/presentational —
 * the actual deletion happens in the caller's `onConfirm`.
 */
export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  confirmPhrase,
  onConfirm,
  onClose,
}: ConfirmDialogProps): ReactElement | null => {
  const [typed, setTyped] = useState("")

  if (!open) return null

  const gated = confirmPhrase !== undefined && typed !== confirmPhrase

  return (
    <Modal title={title} open={open} onClose={onClose}>
      <p className="lk-confirm-dialog__message">{message}</p>
      {confirmPhrase !== undefined ? (
        <input
          aria-label="confirm-phrase"
          className="lk-confirm-dialog__input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      ) : null}
      <Row gap={2} className="lk-form-actions">
        <Button variant="danger" disabled={gated} onClick={() => onConfirm()}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={() => onClose()}>
          Cancel
        </Button>
      </Row>
    </Modal>
  )
}
