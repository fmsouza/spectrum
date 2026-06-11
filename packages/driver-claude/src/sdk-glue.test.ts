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
  setPermissionModeCalls: readonly string[]
} => {
  let options: SdkOptions | undefined
  const state = { interrupts: 0, closes: 0 }
  const pushed: unknown[] = []
  const setPermissionModeCalls: string[] = []
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
      setPermissionMode: async (mode: string) => {
        setPermissionModeCalls.push(mode)
      },
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
    get setPermissionModeCalls() {
      return setPermissionModeCalls
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

  it("merges baseEnv UNDER input.env so claude inherits PATH/HOME but the proxy env wins", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({
      loadSdk: async () => fake.sdk,
      baseEnv: () => ({
        PATH: "/usr/bin",
        HOME: "/home/me",
        ANTHROPIC_BASE_URL: "stale-should-be-overridden",
      }),
    })
    await adapter.start(input, makeCtx([], []))
    const env = fake.capturedOptions().env ?? {}
    expect(env.PATH).toBe("/usr/bin")
    expect(env.HOME).toBe("/home/me")
    // input.env (the per-run proxy vars) wins over the inherited base env
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000")
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("k")
  })

  it("passes input.command as pathToClaudeCodeExecutable (the SDK's bundle-relative default is unusable when packaged)", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    await adapter.start(
      { ...input, command: "/abs/bin/claude" },
      makeCtx([], []),
    )
    expect(fake.capturedOptions().pathToClaudeCodeExecutable).toBe(
      "/abs/bin/claude",
    )
  })

  it("falls back to deps.pathToClaudeExecutable when input.command is absent", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({
      loadSdk: async () => fake.sdk,
      pathToClaudeExecutable: "/dep/claude",
    })
    await adapter.start(input, makeCtx([], []))
    expect(fake.capturedOptions().pathToClaudeCodeExecutable).toBe(
      "/dep/claude",
    )
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
    // The SDK requires `updatedInput` on allow — we echo the original tool input unchanged.
    await expect(resultP).resolves.toEqual({
      behavior: "allow",
      updatedInput: { command: "rm -rf build" },
    })

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

  it("passes the normalized permissionMode to the SDK query options (plan → 'plan')", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    await adapter.start({ ...input, permissionMode: "plan" }, makeCtx([], []))
    expect(fake.capturedOptions().permissionMode).toBe("plan")
  })

  it("handle.setMode calls query.setPermissionMode with the mapped SDK string", async () => {
    const fake = makeFakeSdk([])
    const adapter = createClaudeAdapter({ loadSdk: async () => fake.sdk })
    const handle = await adapter.start(input, makeCtx([], []))
    handle.setMode?.("bypass")
    // setPermissionMode is async/fire-and-forget; wait a tick for the promise to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(fake.setPermissionModeCalls).toEqual(["bypassPermissions"])
  })
})
