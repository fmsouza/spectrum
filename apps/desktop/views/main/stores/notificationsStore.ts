import { type StoreApi, createStore } from "zustand/vanilla"
import {
  type Notification,
  type NotificationInput,
  autoDismissFor,
  reduceNotifications,
} from "./notifications-model"

export type NotificationsStore = {
  readonly notifications: readonly Notification[]
  /** Mint an id, set autoDismiss by tone, insert (dedupe + cap). Returns the id. */
  readonly notify: (input: NotificationInput) => string
  readonly dismiss: (id: string) => void
  readonly clear: () => void
}

export const createNotificationsStore = (deps?: {
  readonly idGen?: () => string
}): StoreApi<NotificationsStore> => {
  const nextId = deps?.idGen ?? (() => crypto.randomUUID())
  return createStore<NotificationsStore>()((set) => ({
    notifications: [],
    notify: (input) => {
      const id = nextId()
      const ms = autoDismissFor(input.tone)
      const notification: Notification = {
        ...input,
        id,
        ...(ms !== undefined ? { autoDismissMs: ms } : {}),
      }
      set((s) => ({
        notifications: reduceNotifications(s.notifications, notification),
      }))
      return id
    },
    dismiss: (id) =>
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
      })),
    clear: () => set({ notifications: [] }),
  }))
}
