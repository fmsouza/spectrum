import { useStore } from "zustand"
import { useStores } from "../stores/createStores"
import type {
  Notification,
  NotificationInput,
} from "../stores/notifications-model"

export type UseNotifications = {
  readonly notifications: readonly Notification[]
  readonly notify: (input: NotificationInput) => string
  readonly dismiss: (id: string) => void
  readonly clear: () => void
}

export const useNotifications = (): UseNotifications => {
  const store = useStores().notifications
  const notifications = useStore(store, (s) => s.notifications)
  const notify = useStore(store, (s) => s.notify)
  const dismiss = useStore(store, (s) => s.dismiss)
  const clear = useStore(store, (s) => s.clear)
  return { notifications, notify, dismiss, clear }
}
