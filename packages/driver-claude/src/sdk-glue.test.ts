import { describe, expect, it } from "bun:test"
import type { AgentStartInput } from "@launchkit/agent-driver"
import type { CanonicalEvent, RunnerId } from "@launchkit/agent-events"
import type { AdapterCtx } from "@launchkit/driver-runtime"
import { createClaudeAdapter } from "./sdk-glue"
import type { ClaudeQuery, ClaudeSdk, SdkOptions } from "./sdk-glue"
import type { SdkMessageLike } from "./sdk-types"

// --- a controllable fake query ----------------------------------------------------------
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }
const defer = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const makeFakeSdk = (
  scripted: readonly unknown[],
): {
  sdk: ClaudeSdk
  capturedOptions: () => SdkOptions
  interrupts: number
  closes: number
  pushedPrompts: readonly unknown[]
} => {
  let options: SdkOptions | undefined
  const state = { interrupts: 0, closes: 0 }
  const pushed: unknown[] = []
  const done = defer<void>()

  const query = (args: {
    prompt: AsyncIterable<unknown>
    options?: SdkOptions
  }): ClaudeQuery => {
    options = args.options
    // Drain the streaming-input prompt in the background to capture follow-ups.
    void (async () => {
      for await (const m of args.prompt) pushed.push(m)
    })()
    const iterator = (async function* (): AsyncGenerator<SdkMessageLike> {
      for (const msg of scripted) yield msg as SdkMessageLike
      await done.promise // block like a live session until closed
    })()
    const q: ClaudeQuery = Object.assign(iterator, {
      interrupt: async () => {
        state.interrupts += 1
      },
      close: () => {
        state.closes += 1
        done.resolve()
      },
      setPermissionMode: async () => undefined,
    })
    return q
  }

  return {
    sdk: { query },
    capturedOptions: () => {
      if (options === undefined) throw new Error("query not called")
      return options
    },
    get interrupts() {
      return state.interrupts
    },
    get closes() {
      return state.closes
    },
    get pushedPrompts() {
      return pushed
    },
  }
}

const ROOT = "rnr_root" as RunnerId
const makeCtx = (
  emitted: CanonicalEvent[],
  approvals: Array<{
    runnerId: RunnerId
    resolve: (d: "allow" | "deny") => void
  }>,
): AdapterCtx => ({
  rootRunnerId: ROOT,
  emit: (e) => emitted.push(e),
  newRunnerId: () => "rnr_child" as RunnerId,
  requestApproval: (runnerId) =>
    new Promise((resolve) => approvals.push({ runnerId, resolve })),
})

const input: AgentStartInput = {
  harnessId: "claude" as never,
  cwd: "/work",
  env: {
    ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
    ANTHROPIC_AUTH_TOKEN: "k",
  },
}

describe("createClaudeAdapter", () => {
  it("passes the proxy env + cwd into the SDK query options", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    await adapter.start(input, makeCtx([], []))
    const opts = fake.capturedOptions()
    expect(opts.env).toEqual(input.env)
    expect(opts.cwd).toBe("/work")
  })

  it("pumps each yielded SDK message through mapClaudeMessage into ctx.emit", async () => {
    const fake = makeFakeSdk([
      { type: "system", subtype: "init", model: "claude-x" },
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "hi" }] },
      },
    ])
    const emitted: CanonicalEvent[] = []
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    await adapter.start(input, makeCtx(emitted, []))
    // allow the background pump to drain the scripted messages
    await new Promise((r) => setTimeout(r, 10))
    expect(emitted[0]).toEqual({
      type: "runner-started",
      runnerId: ROOT,
      model: "claude-x",
    })
    expect(emitted[1]).toMatchObject({
      type: "text-delta",
      runnerId: ROOT,
      text: "hi",
    })
  })

  it("routes canUseTool through ctx.requestApproval and returns allow/deny as a PermissionResult", async () => {
    const fake = makeFakeSdk([])
    const approvals: Array<{
      runnerId: RunnerId
      resolve: (d: "allow" | "deny") => void
    }> = []
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    await adapter.start(input, makeCtx([], approvals))
    const canUseTool = fake.capturedOptions().canUseTool
    if (canUseTool === undefined) throw new Error("canUseTool not set")
    const resultP = canUseTool(
      "Bash",
      { command: "rm -rf build" },
      { signal: new AbortController().signal, toolUseID: "toolu_1" },
    )
    // it asked for approval against the root runner with a command target
    expect(approvals).toHaveLength(1)
    approvals[0]?.resolve("allow")
    await expect(resultP).resolves.toEqual({ behavior: "allow" })

    const denyP = canUseTool(
      "Bash",
      { command: "rm -rf /" },
      { signal: new AbortController().signal, toolUseID: "toolu_2" },
    )
    approvals[1]?.resolve("deny")
    await expect(denyP).resolves.toMatchObject({ behavior: "deny" })
  })

  it("send pushes a user message into the streaming-input prompt", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    const handle = await adapter.start(input, makeCtx([], []))
    handle.send("follow up")
    await new Promise((r) => setTimeout(r, 10))
    expect(fake.pushedPrompts).toContainEqual({
      type: "user",
      message: { role: "user", content: "follow up" },
      parent_tool_use_id: null,
    })
  })

  it("interrupt calls query.interrupt and close ends the query (idempotent)", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    const handle = await adapter.start(input, makeCtx([], []))
    handle.interrupt()
    expect(fake.interrupts).toBe(1)
    handle.close()
    handle.close()
    expect(fake.closes).toBe(1)
  })
})
