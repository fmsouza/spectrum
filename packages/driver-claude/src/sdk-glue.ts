import type { AgentStartInput } from "@launchkit/agent-driver"
import type { ApprovalDecision, ApprovalTarget } from "@launchkit/agent-events"
import type {
  AdapterCtx,
  AdapterHandle,
  DriverAdapter,
} from "@launchkit/driver-runtime"
import { initialClaudeMapState, mapClaudeMessage } from "./map-claude-message"
import type { SdkMessageLike } from "./sdk-types"

/** A user message in the SDK's streaming-input format. */
export interface SdkUserInput {
  readonly type: "user"
  readonly message: { readonly role: "user"; readonly content: string }
  readonly parent_tool_use_id: null
}

/** A tool-permission result in the SDK's `PermissionResult` shape. */
export type SdkPermissionResult =
  | {
      readonly behavior: "allow"
      readonly updatedInput?: Record<string, unknown>
    }
  | {
      readonly behavior: "deny"
      readonly message: string
      readonly interrupt?: boolean
    }

/** The subset of the SDK's `Options` the glue sets. */
export interface SdkOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly model?: string
  readonly abortController?: AbortController
  readonly permissionMode?: string
  readonly pathToClaudeCodeExecutable?: string
  readonly canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string },
  ) => Promise<SdkPermissionResult>
  readonly stderr?: (data: string) => void
}

/** The subset of the SDK's `Query` the glue uses. */
export interface ClaudeQuery extends AsyncIterable<SdkMessageLike> {
  interrupt(): Promise<void>
  close(): void
  setPermissionMode?(mode: string): Promise<void>
}

/** The subset of `@anthropic-ai/claude-agent-sdk` the glue needs (injected for testing). */
export interface ClaudeSdk {
  query(args: {
    prompt: AsyncIterable<SdkUserInput>
    options?: SdkOptions
  }): ClaudeQuery
}

/** Map a canonical approval decision → the SDK's PermissionResult. */
const toPermissionResult = (
  decision: ApprovalDecision,
  _input: Record<string, unknown>,
): SdkPermissionResult =>
  decision === "deny"
    ? { behavior: "deny", message: "Denied by user" }
    : { behavior: "allow" } // allow + allow-always both proceed

/** Infer an ApprovalTarget from the tool name + input (command/file/tool). */
const targetFor = (
  toolName: string,
  input: Record<string, unknown>,
): ApprovalTarget => {
  if (toolName === "Bash" && typeof input.command === "string")
    return { kind: "command", detail: input.command }
  if (
    (toolName === "Edit" || toolName === "Write") &&
    typeof input.file_path === "string"
  )
    return { kind: "file", detail: input.file_path }
  return { kind: "tool", detail: toolName }
}

/** A queue-backed async generator the caller pushes user turns into; `end()` closes the stream. */
const makeInputStream = (): {
  stream: AsyncGenerator<SdkUserInput>
  push: (text: string) => void
  end: () => void
} => {
  const queue: SdkUserInput[] = []
  let wake: (() => void) | null = null
  let ended = false
  const next = (): Promise<void> =>
    new Promise((resolve) => {
      wake = resolve
    })
  const stream = (async function* (): AsyncGenerator<SdkUserInput> {
    while (true) {
      while (queue.length > 0) {
        const item = queue.shift()
        if (item !== undefined) yield item
      }
      if (ended) return
      await next()
    }
  })()
  return {
    stream,
    push: (text) => {
      queue.push({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
      })
      wake?.()
      wake = null
    },
    end: () => {
      ended = true
      wake?.()
      wake = null
    },
  }
}

/**
 * Build the Claude `DriverAdapter`.
 *
 * - `loadSdk` lazily loads `@anthropic-ai/claude-agent-sdk` (injected so tests pass a fake `query`).
 * - The Claude executable is taken from `input.command` (the harness-resolved absolute `claude`),
 *   falling back to `deps.pathToClaudeExecutable`. This is REQUIRED in the bundled app: the SDK's own
 *   default resolution is bundle-relative and finds no `cli.js` (the packaged binary ships no
 *   node_modules), so without an explicit path `query()` throws "Claude Code executable not found".
 * - `baseEnv` (default `process.env`) is merged UNDER `input.env` — the spawned `claude` inherits the
 *   parent `PATH`/`HOME` (so it can resolve tools and read its auth/config dir) while the per-run proxy
 *   vars win. Mirrors the embedded-terminal spawn seam (`ffi-pty`'s `{ ...process.env, ...opts.env }`).
 */
export const createClaudeAdapter = (deps: {
  loadSdk: () => Promise<ClaudeSdk>
  pathToClaudeExecutable?: string
  baseEnv?: () => Record<string, string | undefined>
}): DriverAdapter => ({
  start: async (
    input: AgentStartInput,
    ctx: AdapterCtx,
  ): Promise<AdapterHandle> => {
    const sdk = await deps.loadSdk()
    const inputStream = makeInputStream()
    const abort = new AbortController()
    // Seed the first turn from initialPrompt so the live session has something to do.
    if (input.initialPrompt !== undefined) inputStream.push(input.initialPrompt)
    const state = initialClaudeMapState(ctx.rootRunnerId)
    state.newRunnerId = ctx.newRunnerId

    const executable = input.command ?? deps.pathToClaudeExecutable
    const query = sdk.query({
      prompt: inputStream.stream,
      options: {
        cwd: input.cwd,
        env: { ...(deps.baseEnv?.() ?? {}), ...input.env },
        ...(input.modelId !== undefined
          ? { model: String(input.modelId) }
          : {}),
        abortController: abort,
        permissionMode: "default",
        ...(executable !== undefined
          ? { pathToClaudeCodeExecutable: executable }
          : {}),
        canUseTool: async (toolName, toolInput) => {
          const decision = await ctx.requestApproval(
            ctx.rootRunnerId,
            targetFor(toolName, toolInput),
          )
          return toPermissionResult(
            decision,
            toolInput as Record<string, unknown>,
          )
        },
      },
    })

    // Pump the SDK message stream → canonical events. A thrown iterator ends the run as errored.
    void (async () => {
      try {
        for await (const msg of query) {
          for (const event of mapClaudeMessage(msg, state)) ctx.emit(event)
        }
      } catch (err) {
        ctx.emit({
          type: "runner-finished",
          runnerId: ctx.rootRunnerId,
          status: "errored",
          error: String(err),
        })
      }
    })()

    let closed = false
    return {
      send: (text) => inputStream.push(text),
      interrupt: () => {
        void query.interrupt()
      },
      close: () => {
        if (closed) return
        closed = true
        inputStream.end()
        abort.abort()
        query.close()
      },
    }
  },
})
