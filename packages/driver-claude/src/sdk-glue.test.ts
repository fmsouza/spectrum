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

// --- multi-query fake SDK for restart tests ---------------------------------------------
/** Per-query record captured by the multi-query fake. */
interface QueryRecord {
  options: SdkOptions | undefined
  pushedPrompts: unknown[]
  closes: number
  setPermissionModeCalls: string[]
  /** Resolve to unblock the query iterator (simulates close). */
  unblock: () => void
  /** Push a message into the query's scripted stream (post-creation). */
  pushMsg: (msg: SdkMessageLike) => void
}

/**
 * A multi-query fake SDK that records every `query()` call independently.
 * Each call gets its own record so tests can assert on the second (restart) query.
 *
 * `setPermissionModeBehavior` controls what `setPermissionMode` does:
 *   - `"resolve"` → the call resolves normally (in-place switch)
 *   - `"reject"`  → the call rejects with the bypass-permissions error
 *   - `"absent"`  → `setPermissionMode` is not present on the query object
 *
 * `throwOnClose` — when true, closing/aborting the query's iterator throws an
 * AbortError-like error instead of completing cleanly (simulates the real SDK
 * throwing when the abort controller fires while the `for await` is running).
 */
const makeMultiQueryFakeSdk = (
  setPermissionModeBehavior: "resolve" | "reject" | "absent",
  throwOnClose = false,
): {
  sdk: ClaudeSdk
  queries: QueryRecord[]
} => {
  const queries: QueryRecord[] = []

  const query = (args: {
    prompt: AsyncIterable<unknown>
    options?: SdkOptions
  }): ClaudeQuery => {
    const done = defer<void>()
    const msgQueue: SdkMessageLike[] = []
    let msgWake: (() => void) | null = null
    let shouldThrow = false

    const record: QueryRecord = {
      options: args.options,
      pushedPrompts: [],
      closes: 0,
      setPermissionModeCalls: [],
      unblock: () => done.resolve(),
      pushMsg: (msg) => {
        msgQueue.push(msg)
        msgWake?.()
        msgWake = null
      },
    }
    queries.push(record)

    // Drain the streaming-input prompt.
    void (async () => {
      for await (const m of args.prompt) record.pushedPrompts.push(m)
    })()

    const iterator = (async function* (): AsyncGenerator<SdkMessageLike> {
      while (true) {
        while (msgQueue.length > 0) {
          const msg = msgQueue.shift()
          if (msg !== undefined) yield msg
        }
        // Race: either a new message arrives or done resolves.
        const raceWake = new Promise<void>((r) => {
          msgWake = r
        })
        // If done already resolved, stop or throw.
        let finished = false
        done.promise.then(() => {
          finished = true
          msgWake?.()
          msgWake = null
        })
        await raceWake
        if (finished && msgQueue.length === 0) {
          if (shouldThrow) {
            throw new Error("AbortError: The operation was aborted.")
          }
          break
        }
      }
    })()

    const setPermissionMode =
      setPermissionModeBehavior === "absent"
        ? undefined
        : async (mode: string) => {
            record.setPermissionModeCalls.push(mode)
            if (setPermissionModeBehavior === "reject") {
              throw new Error(
                "Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions",
              )
            }
          }

    const q: ClaudeQuery = Object.assign(iterator, {
      interrupt: async () => {},
      close: () => {
        record.closes += 1
        if (throwOnClose) shouldThrow = true
        done.resolve()
      },
      ...(setPermissionMode !== undefined ? { setPermissionMode } : {}),
    })
    return q
  }

  return { sdk: { query }, queries }
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

  // --- restart-on-rejection tests ---------------------------------------------------------

  it("restarts the query with resume and the new mode when setPermissionMode rejects", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("reject")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const emitted: CanonicalEvent[] = []
    const handle = await adapter.start(input, makeCtx(emitted, []))

    // Push an init message so the glue captures the claude session id.
    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_abc",
    })
    await new Promise((r) => setTimeout(r, 10))

    handle.setMode?.("bypass")
    // Allow the rejection handler microtask to run, then the restart to happen.
    await new Promise((r) => setTimeout(r, 20))

    // Two query() calls: the original and the restarted one.
    expect(queries).toHaveLength(2)
    // Second call carries the new permissionMode and the captured session id.
    expect(queries[1]?.options?.permissionMode).toBe("bypassPermissions")
    expect(queries[1]?.options?.resume).toBe("sess_abc")
    // No runner-finished errored event must have been emitted during the restart.
    const erroredEvents = emitted.filter(
      (e) => e.type === "runner-finished" && e.status === "errored",
    )
    expect(erroredEvents).toHaveLength(0)
  })

  it("switches in place when setPermissionMode resolves", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("resolve")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    handle.setMode?.("plan")
    await new Promise((r) => setTimeout(r, 10))

    // Only one query() call — no restart happened.
    expect(queries).toHaveLength(1)
    expect(queries[0]?.setPermissionModeCalls).toEqual(["plan"])
  })

  it("routes send to the new input stream after a restart", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("reject")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_xyz",
    })
    await new Promise((r) => setTimeout(r, 10))

    handle.setMode?.("bypass")
    await new Promise((r) => setTimeout(r, 20))

    // After restart, send should go to the second query's input stream.
    handle.send("hi after restart")
    await new Promise((r) => setTimeout(r, 10))

    expect(queries).toHaveLength(2)
    const secondPrompts = queries[1]?.pushedPrompts ?? []
    expect(secondPrompts).toContainEqual({
      type: "user",
      message: { role: "user", content: "hi after restart" },
      parent_tool_use_id: null,
    })
  })

  it("restarts immediately when the SDK has no setPermissionMode", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("absent")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    handle.setMode?.("bypass")
    await new Promise((r) => setTimeout(r, 10))

    expect(queries).toHaveLength(2)
    expect(queries[1]?.options?.permissionMode).toBe("bypassPermissions")
  })

  // --- Finding 1: stale-pump race ---------------------------------------------------------

  it("does not emit errored when the old query throws on teardown during a restart", async () => {
    // throwOnClose=true: the first query's iterator throws an AbortError-like error
    // when close() fires, simulating the real SDK behaviour.
    const { sdk, queries } = makeMultiQueryFakeSdk("reject", true)
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const emitted: CanonicalEvent[] = []
    const handle = await adapter.start(input, makeCtx(emitted, []))

    // Capture the session id so restart can resume.
    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_throw",
    })
    await new Promise((r) => setTimeout(r, 10))

    handle.setMode?.("bypass")
    // Give the rejection handler, the restart, AND the old pump's catch time to all run.
    await new Promise((r) => setTimeout(r, 30))

    // There must be NO runner-finished errored event — the throw came from teardown.
    const erroredEvents = emitted.filter(
      (e) => e.type === "runner-finished" && e.status === "errored",
    )
    expect(erroredEvents).toHaveLength(0)
    // And we still got a second query (the restart happened).
    expect(queries).toHaveLength(2)
  })

  // --- Finding 2: setMode before session id is known -------------------------------------

  it("defers the restart until the session id is known", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("reject")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    // Call setMode BEFORE system:init has been received (claudeSessionId === undefined).
    handle.setMode?.("bypass")
    await new Promise((r) => setTimeout(r, 20))

    // Should NOT have launched a second query yet — we can't resume without a session id.
    expect(queries).toHaveLength(1)

    // Now deliver the init message so the glue captures the session id.
    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_deferred",
    })
    await new Promise((r) => setTimeout(r, 30))

    // NOW the deferred restart should have fired with resume + the new mode.
    expect(queries).toHaveLength(2)
    expect(queries[1]?.options?.permissionMode).toBe("bypassPermissions")
    expect(queries[1]?.options?.resume).toBe("sess_deferred")
  })

  // --- setModel: resume-restart with new model -------------------------------------------

  it("setModel relaunches the query with the new model, resuming the claude session", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("resolve")
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    // Push an init message so the glue captures the claude session id.
    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_mdl",
    })
    await new Promise((r) => setTimeout(r, 10))

    handle.setModel?.("mdl_new" as never)
    // setModel is synchronous (relaunches immediately); allow the restart to happen.
    await new Promise((r) => setTimeout(r, 20))

    // Two query() calls: the original and the relaunched one.
    expect(queries).toHaveLength(2)
    // Second call carries the new model and the captured session id (resume).
    expect(queries[1]?.options?.model).toBe("mdl_new")
    expect(queries[1]?.options?.resume).toBe("sess_mdl")
  })

  it("setModel does not emit errored when the old query throws on teardown", async () => {
    const { sdk, queries } = makeMultiQueryFakeSdk("resolve", true)
    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const emitted: CanonicalEvent[] = []
    const handle = await adapter.start(input, makeCtx(emitted, []))

    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_mdl_throw",
    })
    await new Promise((r) => setTimeout(r, 10))

    handle.setModel?.("mdl_newer" as never)
    // Give the restart, AND the old pump's catch time to all run.
    await new Promise((r) => setTimeout(r, 30))

    const erroredEvents = emitted.filter(
      (e) => e.type === "runner-finished" && e.status === "errored",
    )
    expect(erroredEvents).toHaveLength(0)
    expect(queries).toHaveLength(2)
    expect(queries[1]?.options?.model).toBe("mdl_newer")
    expect(queries[1]?.options?.resume).toBe("sess_mdl_throw")
  })

  // --- Finding 3: rapid double setMode → stale rejection ---------------------------------

  it("ignores a stale rejection after a newer restart already happened", async () => {
    // We need two rejections that we can resolve in controlled order.
    // Use a custom SDK where setPermissionMode rejects with a controllable deferred.
    const queries: QueryRecord[] = []
    const rejectDeferreds: Array<{ reject: (e: Error) => void }> = []

    const sdk: ClaudeSdk = {
      query: (args) => {
        const done = defer<void>()
        const msgQueue: SdkMessageLike[] = []
        let msgWake: (() => void) | null = null

        const record: QueryRecord = {
          options: args.options,
          pushedPrompts: [],
          closes: 0,
          setPermissionModeCalls: [],
          unblock: () => done.resolve(),
          pushMsg: (msg) => {
            msgQueue.push(msg)
            msgWake?.()
            msgWake = null
          },
        }
        queries.push(record)

        void (async () => {
          for await (const m of args.prompt) record.pushedPrompts.push(m)
        })()

        const iterator = (async function* (): AsyncGenerator<SdkMessageLike> {
          while (true) {
            while (msgQueue.length > 0) {
              const msg = msgQueue.shift()
              if (msg !== undefined) yield msg
            }
            const raceWake = new Promise<void>((r) => {
              msgWake = r
            })
            let finished = false
            done.promise.then(() => {
              finished = true
              msgWake?.()
              msgWake = null
            })
            await raceWake
            if (finished && msgQueue.length === 0) break
          }
        })()

        const q: ClaudeQuery = Object.assign(iterator, {
          interrupt: async () => {},
          close: () => {
            record.closes += 1
            done.resolve()
          },
          setPermissionMode: async (mode: string) => {
            record.setPermissionModeCalls.push(mode)
            // Each call to setPermissionMode gets its own controllable deferred rejection.
            await new Promise<void>((_resolve, reject) => {
              rejectDeferreds.push({ reject })
            })
          },
        })
        return q
      },
    }

    const adapter = createClaudeAdapter({ loadSdk: async () => sdk })
    const handle = await adapter.start(input, makeCtx([], []))

    // Push session id so restarts can resume.
    queries[0]?.pushMsg({
      type: "system",
      subtype: "init",
      model: "m",
      session_id: "sess_rapid",
    })
    await new Promise((r) => setTimeout(r, 10))

    // Two rapid setMode calls — both hit setPermissionMode before either rejects.
    handle.setMode?.("bypass")
    handle.setMode?.("plan")
    await new Promise((r) => setTimeout(r, 10))

    // Now reject the FIRST setPermissionMode — this should trigger restart #1.
    rejectDeferreds[0]?.reject(new Error("rejected-first"))
    await new Promise((r) => setTimeout(r, 20))

    // Now reject the SECOND setPermissionMode — this is stale (a newer restart already
    // happened), so it must NOT trigger a third query.
    rejectDeferreds[1]?.reject(new Error("rejected-second"))
    await new Promise((r) => setTimeout(r, 20))

    // Exactly TWO queries: the original + one restart.
    // A third query would mean the stale rejection triggered an extra restart.
    expect(queries).toHaveLength(2)
  })
})
