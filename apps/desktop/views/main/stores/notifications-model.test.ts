import { describe, expect, it } from "bun:test"
import {
  MAX_TOASTS,
  type Notification,
  autoDismissFor,
  reduceNotifications,
} from "./notifications-model"

const n = (
  id: string,
  message: string,
  autoDismissMs?: number,
): Notification => ({
  id,
  tone: autoDismissMs === undefined ? "error" : "info",
  message,
  ...(autoDismissMs !== undefined ? { autoDismissMs } : {}),
})

describe("autoDismissFor", () => {
  it("auto-dismisses info and success but not warning or error", () => {
    expect(autoDismissFor("info")).toBe(5000)
    expect(autoDismissFor("success")).toBe(5000)
    expect(autoDismissFor("warning")).toBeUndefined()
    expect(autoDismissFor("error")).toBeUndefined()
  })
})

describe("reduceNotifications", () => {
  it("appends a new notification", () => {
    expect(
      reduceNotifications([], n("a", "hi", 5000)).map((x) => x.id),
    ).toEqual(["a"])
  })

  it("drops a duplicate of an identical visible tone+message", () => {
    const first = reduceNotifications([], n("a", "same", 5000))
    const second = reduceNotifications(first, n("b", "same", 5000))
    expect(second.map((x) => x.id)).toEqual(["a"])
  })

  it("caps the stack at MAX_TOASTS, dropping the oldest auto-dismissible first", () => {
    let list: readonly Notification[] = []
    // 1 sticky error first, then fill with auto-dismiss infos
    list = reduceNotifications(list, n("err", "boom"))
    for (let i = 0; i < MAX_TOASTS; i++)
      list = reduceNotifications(list, n(`i${i}`, `info ${i}`, 5000))
    expect(list.length).toBe(MAX_TOASTS)
    // the sticky error survived; the oldest auto-dismissible (i0) was dropped
    expect(list.some((x) => x.id === "err")).toBe(true)
    expect(list.some((x) => x.id === "i0")).toBe(false)
  })
})
