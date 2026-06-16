import type { ReactElement } from "react"
import { useNotifications } from "../hooks/useNotifications"

/** Test-only probe: renders queued toast messages (and any action label) so tests can assert them. */
export const Toasts = (): ReactElement => {
  const { notifications } = useNotifications()
  return (
    <>
      {notifications.map((n) => (
        <div key={n.id}>
          {n.message}
          {n.action !== undefined ? (
            <button type="button">{n.action.label}</button>
          ) : null}
        </div>
      ))}
    </>
  )
}
