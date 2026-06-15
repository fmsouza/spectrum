import { describe, expect, it } from "bun:test"
import { createNotificationsStore } from "./notificationsStore"

const seqId = () => {
  let i = 0
  return () => `n${++i}`
}

describe("createNotificationsStore", () => {
  it("notify mints an id, applies the tone auto-dismiss policy, and inserts", () => {
    const store = createNotificationsStore({ idGen: seqId() })
    const id = store.getState().notify({ tone: "info", message: "hi" })
    expect(id).toBe("n1")
    const list = store.getState().notifications
    expect(list[0]?.autoDismissMs).toBe(5000)
    expect(list[0]?.message).toBe("hi")
  })

  it("error toasts are sticky (no autoDismissMs)", () => {
    const store = createNotificationsStore({ idGen: seqId() })
    store.getState().notify({ tone: "error", message: "boom" })
    expect(store.getState().notifications[0]?.autoDismissMs).toBeUndefined()
  })

  it("dismiss removes by id and clear empties", () => {
    const store = createNotificationsStore({ idGen: seqId() })
    const id = store.getState().notify({ tone: "error", message: "a" })
    store.getState().notify({ tone: "error", message: "b" })
    store.getState().dismiss(id)
    expect(store.getState().notifications.map((n) => n.message)).toEqual(["b"])
    store.getState().clear()
    expect(store.getState().notifications).toEqual([])
  })
})
