import { describe, expect, it } from "bun:test"
import { createBrowserConsoleSink, createWebviewLogger } from "./logger"

describe("createBrowserConsoleSink", () => {
  it("routes each level to the matching console method", () => {
    const calls: string[] = []
    const sink = createBrowserConsoleSink({
      debug: () => calls.push("debug"),
      info: () => calls.push("info"),
      warn: () => calls.push("warn"),
      error: () => calls.push("error"),
    })
    sink.write({ ts: "t", level: "warn", scope: "s", msg: "m" })
    sink.write({ ts: "t", level: "fatal", scope: "s", msg: "m" })
    expect(calls).toEqual(["warn", "error"]) // fatal maps to console.error
  })
})

describe("createWebviewLogger", () => {
  it("forwards error/fatal to the IPC client but not debug/info", () => {
    const forwarded: string[] = []
    const log = createWebviewLogger({
      console: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      forward: (p) => {
        forwarded.push(p.level)
        return Promise.resolve()
      },
    })
    log.debug("d")
    log.info("i")
    log.error("e")
    log.child("X").fatal("f")
    expect(forwarded).toEqual(["error", "fatal"])
  })
})
