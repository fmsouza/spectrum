import { describe, expect, it } from "bun:test"
import type { AgentStartInput } from "@launchkit/agent-driver"
import type {
  ApprovalDecision,
  ApprovalTarget,
  CanonicalEvent,
  RunnerId,
} from "@launchkit/agent-events"
import type { AdapterCtx } from "@launchkit/driver-runtime"
import { createSequentialIdGen } from "@launchkit/utils"
import { type CreateCodexAdapterDeps, createCodexAdapter } from "./adapter"
import type {
  JsonRpcTransport,
  NotificationFrame,
  ServerRequestFrame,
} from "./transport"

const root = "rnr_root" as RunnerId

type OutgoingCall = ["request", string, unknown] | ["notify", string, unknown]
type Reply = { id: string | number; result?: unknown; error?: unknown }

type CreateTransportDeps = Parameters<
  NonNullable<CreateCodexAdapterDeps["createTransport"]>
>[0]

interface FakeTransport {
  readonly transport: JsonRpcTransport
  readonly outgoing: OutgoingCall[]
  readonly replies: Reply[]
  pushNotification(n: NotificationFrame): void
  pushServerRequest(r: ServerRequestFrame): void
  closed(): boolean
  setResult(method: string, result: unknown): void
  setReject(method: string, message: string): void
  createDeps(): CreateTransportDeps | undefined
}

/** A fake JsonRpcTransport that records outgoing calls + lets the test push server frames. */
const makeFakeTransport = (): {
  fake: FakeTransport
  factory: NonNullable<CreateCodexAdapterDeps["createTransport"]>
} => {
  const outgoing: OutgoingCall[] = []
  const replies: Reply[] = []
  const results = new Map<string, unknown>()
  const rejects = new Map<string, string>()
  let isClosed = false
  let onNotification: ((n: NotificationFrame) => void) | undefined
  let onServerRequest: ((r: ServerRequestFrame) => void) | undefined
  let createDeps: CreateTransportDeps | undefined

  const transport: JsonRpcTransport = {
    dispatcher: {
      request: (method, params) => {
        outgoing.push(["request", method, params])
        const rejectMsg = rejects.get(method)
        if (rejectMsg !== undefined) return Promise.reject(new Error(rejectMsg))
        return Promise.resolve(results.get(method))
      },
      notify: (method, params) => {
        outgoing.push(["notify", method, params])
      },
      respond: (id, result) => {
        replies.push({ id, result })
      },
      respondError: (id, code, message) => {
        replies.push({ id, error: { code, message } })
      },
      feed: () => {},
      rejectAll: () => {},
    },
    close: () => {
      isClosed = true
    },
  }

  const fake: FakeTransport = {
    transport,
    outgoing,
    replies,
    pushNotification: (n) => onNotification?.(n),
    pushServerRequest: (r) => onServerRequest?.(r),
    closed: () => isClosed,
    setResult: (method, result) => results.set(method, result),
    setReject: (method, message) => rejects.set(method, message),
    createDeps: () => createDeps,
  }

  const factory: NonNullable<CreateCodexAdapterDeps["createTransport"]> = (
    deps,
  ) => {
    createDeps = deps
    onNotification = deps.onNotification
    onServerRequest = deps.onServerRequest
    return transport
  }

  return { fake, factory }
}

interface RecordingCtx {
  readonly ctx: AdapterCtx
  readonly emitted: CanonicalEvent[]
  readonly approvalCalls: Array<{ runnerId: RunnerId; target: ApprovalTarget }>
  resolveApproval(decision: ApprovalDecision): void
}

const makeCtx = (): RecordingCtx => {
  const emitted: CanonicalEvent[] = []
  const approvalCalls: Array<{ runnerId: RunnerId; target: ApprovalTarget }> =
    []
  let pendingApproval: ((d: ApprovalDecision) => void) | undefined
  let child = 0
  const ctx: AdapterCtx = {
    rootRunnerId: root,
    emit: (e) => emitted.push(e),
    newRunnerId: () => `rnr_child_${++child}` as RunnerId,
    requestApproval: (runnerId, target) => {
      approvalCalls.push({ runnerId, target })
      return new Promise<ApprovalDecision>((resolve) => {
        pendingApproval = resolve
      })
    },
  }
  return {
    ctx,
    emitted,
    approvalCalls,
    resolveApproval: (d) => pendingApproval?.(d),
  }
}

const startInput: AgentStartInput = {
  harnessId: "codex" as never,
  cwd: "/repo",
  env: {},
  modelId: "gpt-5" as never,
}

const makeAdapter = (fake: ReturnType<typeof makeFakeTransport>) =>
  createCodexAdapter({
    idGen: createSequentialIdGen(),
    createTransport: fake.factory,
  })

describe("createCodexAdapter.start", () => {
  it("does initialize → initialized → thread/start and emits the root runner-started", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)

    const methods = ft.fake.outgoing.map(([kind, m]) => `${kind}:${m}`)
    expect(methods).toEqual([
      "request:initialize",
      "notify:initialized",
      "request:thread/start",
    ])
    const threadStart = ft.fake.outgoing.find(([, m]) => m === "thread/start")
    expect(threadStart?.[2]).toEqual({ cwd: "/repo", model: "gpt-5" })
    expect(ctx.emitted).toContainEqual({
      type: "runner-started",
      runnerId: root,
      model: "gpt-5",
    })
  })

  it("spawns `app-server` with ONLY the `-c` overrides, dropping the terminal `-m <model>` flag", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(
      {
        ...startInput,
        // The full resolved codex args: `-c` provider overrides PLUS the TUI `-m <model>`.
        args: [
          "-c",
          "model_provider=launchkit",
          "-c",
          "model_providers.launchkit.base_url=http://127.0.0.1:4000/v1",
          "-m",
          "minimax-m3",
        ],
      },
      ctx.ctx,
    )
    // app-server rejects `-m`; the model is sent via thread/start instead.
    expect(ft.fake.createDeps()?.args).toEqual([
      "app-server",
      "-c",
      "model_provider=launchkit",
      "-c",
      "model_providers.launchkit.base_url=http://127.0.0.1:4000/v1",
    ])
  })

  it("spawns just `app-server` when no harness args are provided", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)
    expect(ft.fake.createDeps()?.args).toEqual(["app-server"])
  })

  it("rejects start when thread/start rejects", async () => {
    const ft = makeFakeTransport()
    ft.fake.setReject("thread/start", "boom")
    const ctx = makeCtx()
    await expect(makeAdapter(ft).start(startInput, ctx.ctx)).rejects.toThrow(
      "boom",
    )
  })

  it("maps + emits a pushed turn/completed notification", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)
    ctx.emitted.length = 0
    ft.fake.pushNotification({
      method: "turn/completed",
      params: {
        threadId: "th_1",
        turn: { id: "tn_1", items: [], status: "completed", error: null },
      },
    })
    expect(ctx.emitted).toEqual([{ type: "turn-finished", runnerId: root }])
  })

  it("routes a command-approval server request through ctx.requestApproval and replies accept on allow", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)
    ft.fake.pushServerRequest({
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "th_1",
        turnId: "tn_1",
        itemId: "it_cmd",
        startedAtMs: 1,
        command: "rm x",
      },
    })
    expect(ctx.approvalCalls).toEqual([
      { runnerId: root, target: { kind: "command", detail: "rm x" } },
    ])
    ctx.resolveApproval("allow")
    await Promise.resolve()
    await Promise.resolve()
    expect(ft.fake.replies).toEqual([{ id: 7, result: { decision: "accept" } }])
  })

  it("replies decline on deny and acceptForSession on allow-always for a file-change approval", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)
    ft.fake.pushServerRequest({
      id: 9,
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "th_1",
        turnId: "tn_1",
        itemId: "it_fc",
        startedAtMs: 1,
      },
    })
    expect(ctx.approvalCalls[0]?.target.kind).toBe("file")
    ctx.resolveApproval("allow-always")
    await Promise.resolve()
    await Promise.resolve()
    expect(ft.fake.replies).toEqual([
      { id: 9, result: { decision: "acceptForSession" } },
    ])
  })

  it("answers an unsupported server request with a JSON-RPC error", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    await makeAdapter(ft).start(startInput, ctx.ctx)
    ft.fake.pushServerRequest({
      id: 11,
      method: "item/permissions/requestApproval",
      params: {},
    })
    await Promise.resolve()
    expect(ft.fake.replies).toEqual([
      {
        id: 11,
        error: {
          code: -32601,
          message:
            "unsupported server request: item/permissions/requestApproval",
        },
      },
    ])
  })

  it("send issues turn/start when no turn is active, then turn/steer mid-turn", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    const handle = await makeAdapter(ft).start(startInput, ctx.ctx)
    ft.fake.outgoing.length = 0

    handle.send("first")
    expect(ft.fake.outgoing).toEqual([
      [
        "request",
        "turn/start",
        {
          threadId: "th_1",
          input: [{ type: "text", text: "first", text_elements: [] }],
        },
      ],
    ])

    ft.fake.outgoing.length = 0
    ft.fake.pushNotification({
      method: "turn/started",
      params: {
        threadId: "th_1",
        turn: { id: "tn_active", items: [], status: "inProgress" },
      },
    })
    handle.send("more")
    expect(ft.fake.outgoing).toEqual([
      [
        "request",
        "turn/steer",
        {
          threadId: "th_1",
          input: [{ type: "text", text: "more", text_elements: [] }],
          expectedTurnId: "tn_active",
        },
      ],
    ])
  })

  it("interrupt issues turn/interrupt with the active turn id", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    const handle = await makeAdapter(ft).start(startInput, ctx.ctx)
    ft.fake.pushNotification({
      method: "turn/started",
      params: {
        threadId: "th_1",
        turn: { id: "tn_active", items: [], status: "inProgress" },
      },
    })
    ft.fake.outgoing.length = 0
    handle.interrupt()
    expect(ft.fake.outgoing).toEqual([
      ["request", "turn/interrupt", { threadId: "th_1", turnId: "tn_active" }],
    ])
  })

  it("close is idempotent — closes the transport once", async () => {
    const ft = makeFakeTransport()
    ft.fake.setResult("thread/start", { thread: { id: "th_1" } })
    const ctx = makeCtx()
    const handle = await makeAdapter(ft).start(startInput, ctx.ctx)
    handle.close()
    handle.close()
    expect(ft.fake.closed()).toBe(true)
  })
})
