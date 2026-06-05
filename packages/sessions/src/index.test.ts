import { describe, expect, it } from "bun:test"
import { createFixedClock, createSequentialIdGen, isOk } from "@launchkit/utils"
import * as sessions from "./index"
import { createInMemoryDatabase, createSessionStore } from "./index"

describe("@launchkit/sessions barrel", () => {
  it("exports createSessionStore, createInMemoryDatabase and createBunSqliteDatabase when imported", () => {
    for (const name of [
      "createSessionStore",
      "createInMemoryDatabase",
      "createBunSqliteDatabase",
    ]) {
      expect(sessions).toHaveProperty(name)
      expect(typeof (sessions as Record<string, unknown>)[name]).toBe(
        "function",
      )
    }
  })

  it("round-trips through the public surface alone when create then query are called", () => {
    const store = createSessionStore({
      db: createInMemoryDatabase(),
      clock: createFixedClock(new Date("2026-05-23T10:00:00.000Z")),
      idGen: createSequentialIdGen(),
    })
    store.init()
    store.create({
      harnessId: "claude" as never,
      modelId: "mdl_default" as never,
    })
    const r = store.query()
    expect(isOk(r) && r.value.length).toBe(1)
  })
})
