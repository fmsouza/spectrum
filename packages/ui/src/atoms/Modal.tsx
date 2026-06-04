import { useEffect, useRef } from "react"
import type { ReactElement, ReactNode } from "react"

export type ModalProps = {
  readonly title: string
  readonly open: boolean
  readonly onClose: () => void
  readonly children: ReactNode
}

export const Modal = ({
  title,
  open,
  onClose,
  children,
}: ModalProps): ReactElement | null => {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop close mirrors the dialog Esc handler
    <div
      data-testid="modal-backdrop"
      onClick={() => onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={() => onClose()}>
            ×
          </button>
        </header>
        <div>{children}</div>
      </div>
    </div>
  )
}
