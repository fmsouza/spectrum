import { type ReactElement, useEffect } from "react"
import { Toast, type ToastTone } from "../atoms/Toast"

export type ToastItem = {
  readonly id: string
  readonly tone: ToastTone
  readonly message: string
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly autoDismissMs?: number
}

/** Returns a cancel fn. Default uses setTimeout/clearTimeout; tests inject a manual scheduler. */
type Schedule = (cb: () => void, ms: number) => () => void

const defaultSchedule: Schedule = (cb, ms) => {
  const handle = setTimeout(cb, ms)
  return () => clearTimeout(handle)
}

const ToastRow = ({
  item,
  onDismiss,
  schedule,
}: {
  readonly item: ToastItem
  readonly onDismiss: (id: string) => void
  readonly schedule: Schedule
}): ReactElement => {
  useEffect(() => {
    if (item.autoDismissMs === undefined) return
    return schedule(() => onDismiss(item.id), item.autoDismissMs)
  }, [item.id, item.autoDismissMs, onDismiss, schedule])
  return (
    <Toast
      tone={item.tone}
      message={item.message}
      {...(item.action !== undefined ? { action: item.action } : {})}
      onDismiss={() => onDismiss(item.id)}
    />
  )
}

export type ToastContainerProps = {
  readonly notifications: readonly ToastItem[]
  readonly onDismiss: (id: string) => void
  readonly schedule?: Schedule
}

/** Fixed top-right stack of toasts; owns the auto-dismiss timers. */
export const ToastContainer = ({
  notifications,
  onDismiss,
  schedule = defaultSchedule,
}: ToastContainerProps): ReactElement => (
  <div className="lk-toast-stack" aria-live="polite">
    {notifications.map((item) => (
      <ToastRow
        key={item.id}
        item={item}
        onDismiss={onDismiss}
        schedule={schedule}
      />
    ))}
  </div>
)
