import { describe, expect, it } from "bun:test"
import type { IdGen } from "@launchkit/utils"
import { createJsonRpcDispatcher } from "./transport"

const seqIds = (): IdGen => {
  let n = 0
  return { next: (p) => `${p === "apr" ? "apr" : "rpc"}_${++n}` }
}

describe("createJsonRpcDispatcher — framing + routing", () => {
  it("serializes a request as one newline-delimited JSON line", () => {
    const writes: string[] = []
    const d = createJsonRpcDispatcher({
      write: (s) => writes.push(s),
      idGen: seqIds(),
    })
    void d.request("initialize", {
      clientInfo: { name: "launchkit", version: "0" },
      capabilities: null,
    })
    expect(writes).toEqual([
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc_1",
        method: "initialize",
        params: {
          clientInfo: { name: "launchkit", version: "0" },
          capabilities: null,
        },
      })}\n`,
    ])
  })

  it("resolves a pending request when the response line arrives", async () => {
    const d = createJsonRpcDispatcher({ write: () => {}, idGen: seqIds() })
    const p = d.request("thread/start", {})
    d.feed(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc_1",
        result: { thread: { id: "th_1" } },
      })}\n`,
    )
    await expect(p).resolves.toEqual({ thread: { id: "th_1" } })
  })

  it("rejects a pending request when an error response arrives", async () => {
    const d = createJsonRpcDispatcher({ write: () => {}, idGen: seqIds() })
    const p = d.request("turn/start", {})
    d.feed(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc_1",
        error: { code: -32000, message: "nope" },
      })}\n`,
    )
    await expect(p).rejects.toThrow("nope")
  })

  it("routes notifications and buffers partial lines", () => {
    const notes: unknown[] = []
    const d = createJsonRpcDispatcher({
      write: () => {},
      idGen: seqIds(),
      onNotification: (n) => notes.push(n),
    })
    d.feed('{"method":"turn/started","par')
    d.feed('ams":{"threadId":"th_1"}}\n')
    expect(notes).toEqual([
      { method: "turn/started", params: { threadId: "th_1" } },
    ])
  })

  it("routes server→client requests to onServerRequest", () => {
    const reqs: unknown[] = []
    const d = createJsonRpcDispatcher({
      write: () => {},
      idGen: seqIds(),
      onServerRequest: (r) => reqs.push(r),
    })
    d.feed(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "th_1",
          turnId: "tn_1",
          itemId: "it_fc",
          startedAtMs: 1,
        },
      })}\n`,
    )
    expect(reqs).toEqual([
      {
        id: 7,
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "th_1",
          turnId: "tn_1",
          itemId: "it_fc",
          startedAtMs: 1,
        },
      },
    ])
  })

  it("notify writes a method/params line with no id", () => {
    const writes: string[] = []
    const d = createJsonRpcDispatcher({
      write: (s) => writes.push(s),
      idGen: seqIds(),
    })
    d.notify("initialized", undefined)
    expect(writes).toEqual([
      `${JSON.stringify({ jsonrpc: "2.0", method: "initialized" })}\n`,
    ])
  })

  it("rejectAll rejects every pending request", async () => {
    const d = createJsonRpcDispatcher({ write: () => {}, idGen: seqIds() })
    const p = d.request("thread/start", {})
    d.rejectAll(new Error("closed"))
    await expect(p).rejects.toThrow("closed")
  })
})
