import type { ReactElement } from "react"

export type ToastTone = "info" | "success" | "warning" | "error"

export type ToastProps = {
  readonly tone: ToastTone
  readonly message: string
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly onDismiss: () => void
}

/** A single transient notification. Pure/presentational; the page owns dismiss + action wiring. */
export const Toast = ({
  tone,
  message,
  action,
  onDismiss,
}: ToastProps): ReactElement => (
  // biome-ignore lint/a11y/useSemanticElements: a status live-region, not form <output>.
  <div className="lk-toast" data-tone={tone} role="status" aria-live="polite">
    <span className="lk-toast__msg">{message}</span>
    {action !== undefined ? (
      <button
        type="button"
        className="lk-toast__action"
        onClick={() => action.onClick()}
      >
        {action.label}
      </button>
    ) : null}
    <button
      type="button"
      className="lk-toast__dismiss"
      aria-label="Dismiss"
      onClick={() => onDismiss()}
    >
      ×
    </button>
  </div>
)
