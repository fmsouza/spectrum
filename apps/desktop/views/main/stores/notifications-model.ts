/** Toast severity. Reuses the Badge palette (error → the danger token). */
export type NotificationTone = "info" | "success" | "warning" | "error"

export type NotificationInput = {
  readonly tone: NotificationTone
  readonly message: string
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

export type Notification = NotificationInput & {
  readonly id: string
  /** Auto-dismiss delay in ms; undefined = sticky. */
  readonly autoDismissMs?: number
}

/** Most-recent stack size before older toasts are dropped. */
export const MAX_TOASTS = 4

/** info/success auto-dismiss after 5s; warning/error are sticky. */
export const autoDismissFor = (tone: NotificationTone): number | undefined =>
  tone === "info" || tone === "success" ? 5000 : undefined

/**
 * Pure insert: skip if an identical visible (tone,message) already exists; otherwise append
 * and, if over MAX_TOASTS, drop the oldest auto-dismissible (else the oldest) notification.
 */
export const reduceNotifications = (
  current: readonly Notification[],
  next: Notification,
): readonly Notification[] => {
  const duplicate = current.some(
    (x) => x.tone === next.tone && x.message === next.message,
  )
  if (duplicate) return current
  const appended = [...current, next]
  if (appended.length <= MAX_TOASTS) return appended
  const oldestAuto = appended.findIndex((x) => x.autoDismissMs !== undefined)
  const dropAt = oldestAuto === -1 ? 0 : oldestAuto
  return appended.filter((_, i) => i !== dropAt)
}
