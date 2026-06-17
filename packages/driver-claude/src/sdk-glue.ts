import type { AgentStartInput } from "@spectrum/agent-driver"
import type { ApprovalDecision, ApprovalTarget } from "@spectrum/agent-events"
import type {
  AdapterCtx,
  AdapterHandle,
  DriverAdapter,
} from "@spectrum/driver-runtime"
import type { Logger } from "@spectrum/logger"
import { initialClaudeMapState, mapClaudeMessage } from "./map-claude-message"
import {
  CLAUDE_SUPPORTED_MODES,
  toClaudePermissionMode,
} from "./permission-mode"
import type { SdkMessageLike } from "./sdk-types"

/** Default timer implementation backed by global setTimeout/clearTimeout. */
const defaultSetTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms)
  return () => clearTimeout(id)
}

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
      // The SDK REQUIRES this (it validates the result with zod): the tool input to run with, possibly
      // modified. We pass the original input unchanged.
      readonly updatedInput: Record<string, unknown>
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
  readonly resume?: string
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
  input: Record<string, unknown>,
): SdkPermissionResult =>
  decision === "deny"
    ? { behavior: "deny", message: "Denied by user" }
    : { behavior: "allow", updatedInput: input } // allow + allow-always both proceed

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
 *   vars win (`{ ...process.env, ...input.env }`).
 */
export const createClaudeAdapter = (deps: {
  loadSdk: () => Promise<ClaudeSdk>
  pathToClaudeExecutable?: string
  baseEnv?: () => Record<string, string | undefined>
  logger?: Logger
  setTimer?: (fn: () => void, ms: number) => () => void
  responseTimeoutMs?: number
}): DriverAdapter => ({
  supportedModes: CLAUDE_SUPPORTED_MODES,
  start: async (
    input: AgentStartInput,
    ctx: AdapterCtx,
  ): Promise<AdapterHandle> => {
    const log = deps.logger
    const setTimer = deps.setTimer ?? defaultSetTimer
    const responseTimeoutMs = deps.responseTimeoutMs ?? 30000

    // Mutable current config: `currentMode` is the SDK permission string; `currentModel` is
    // the route id string (or undefined for the default/direct route). launch() / restart()
    // use whatever is current — setMode and setModel mutate these before relaunching.
    let currentMode = toClaudePermissionMode(input.permissionMode ?? "manual")
    let currentModel =
      input.modelId !== undefined ? String(input.modelId) : undefined

    log?.info("claude adapter starting", {
      cwd: input.cwd,
      hasModel: currentModel !== undefined,
      mode: currentMode,
    })

    const sdk = await deps.loadSdk()

    const executable = input.command ?? deps.pathToClaudeExecutable
    log?.info("claude sdk loaded", { hasExecutable: executable !== undefined })

    const state = initialClaudeMapState(ctx.rootRunnerId)
    state.newRunnerId = ctx.newRunnerId

    /** Mutable refs shared across launch closures. */
    let claudeSessionId: string | undefined
    let closed = false
    /**
     * When setMode is called before system:init delivers a session id we cannot resume
     * yet, so we store the requested mode here and apply it once the id is known.
     */
    let pendingRestartMode: string | undefined

    /** The active query quadruple (replaced on restart). */
    let current: {
      query: ClaudeQuery
      inputStream: ReturnType<typeof makeInputStream>
      abort: AbortController
      /** Mark this launch stale so its pump's catch does not emit runner-finished errored. */
      markStale: () => void
    }

    // Watchdog state: armed at most once (on the first user turn).
    let watchdogArmed = false
    let cancelWatchdog: (() => void) | undefined
    // True once the pump has observed the first SDK message (disarms watchdog).
    let firstSdkMessageSeen = false

    const disarmWatchdog = (): void => {
      if (cancelWatchdog !== undefined) {
        cancelWatchdog()
        cancelWatchdog = undefined
      }
    }

    /**
     * Build a fresh inputStream + AbortController + sdk.query and start its pump loop.
     * Reads the current `currentMode` / `currentModel` state for options; `resume` is
     * the claude session id to resume (absent on the initial launch).
     */
    const launch = (resume?: string): typeof current => {
      const inputStream = makeInputStream()
      const abort = new AbortController()
      // Per-launch stale flag: set by restart() BEFORE tearing down this query so the
      // old pump's catch fires AFTER stale is true and swallows the teardown error.
      let stale = false
      const markStale = (): void => {
        stale = true
      }

      // Per-launch first-message tracking for the "log once" behaviour.
      let firstMsgLogged = false

      const query = sdk.query({
        prompt: inputStream.stream,
        options: {
          cwd: input.cwd,
          env: { ...(deps.baseEnv?.() ?? {}), ...input.env },
          ...(currentModel !== undefined ? { model: currentModel } : {}),
          abortController: abort,
          permissionMode: currentMode,
          ...(executable !== undefined
            ? { pathToClaudeCodeExecutable: executable }
            : {}),
          ...(resume !== undefined ? { resume } : {}),
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
          stderr: (data) =>
            log?.warn("claude stderr", { chunk: data.slice(0, 1000) }),
        },
      })

      // Pump the SDK message stream → canonical events.
      void (async () => {
        try {
          for await (const msg of query) {
            // Log the first message seen per launch (not every message — noise).
            if (!firstMsgLogged) {
              firstMsgLogged = true
              log?.info("claude first sdk message", { type: msg.type })
            }
            // Disarm the no-response watchdog on first message.
            if (!firstSdkMessageSeen) {
              firstSdkMessageSeen = true
              disarmWatchdog()
            }
            // Capture the claude session id from the init message so we can resume later.
            if (
              msg.type === "system" &&
              "subtype" in msg &&
              msg.subtype === "init" &&
              "session_id" in msg &&
              typeof msg.session_id === "string"
            ) {
              claudeSessionId = msg.session_id
              // Apply any mode switch that was requested before the session id was known.
              if (pendingRestartMode !== undefined) {
                const mode = pendingRestartMode
                pendingRestartMode = undefined
                currentMode = mode
                restart()
              }
            }
            for (const event of mapClaudeMessage(msg, state)) ctx.emit(event)
          }
        } catch (err) {
          log?.error("claude pump errored", { detail: String(err) })
          // Swallow errors that are caused by tearing down the current query during a
          // restart or close — they must NOT emit runner-finished errored.
          if (closed || stale) return
          ctx.emit({
            type: "runner-finished",
            runnerId: ctx.rootRunnerId,
            status: "errored",
            error: String(err),
          })
        }
      })()

      return { query, inputStream, abort, markStale }
    }

    /**
     * Tear down the current query and relaunch with the current `currentMode` / `currentModel`.
     * The new query resumes the same claude session so history is preserved.
     */
    const restart = (): void => {
      if (closed) return
      // Mark the OLD launch stale BEFORE teardown so its pump's catch (which fires
      // asynchronously as a microtask) sees stale=true and does not emit errored.
      current.markStale()
      current.inputStream.end()
      current.abort.abort()
      current.query.close()
      current = launch(claudeSessionId)
    }

    // Launch with the initial permission mode + model.
    current = launch()
    // Seed the first turn from initialPrompt so the live session has something to do.
    // The prompt queue is drained asynchronously so pushing after launch() is safe.
    if (input.initialPrompt !== undefined)
      current.inputStream.push(input.initialPrompt)

    return {
      send: (text) => {
        log?.info("claude turn -> sdk input", { length: text.length })
        current.inputStream.push(text)
        // Arm the no-response watchdog on the first user turn (exactly once).
        if (!watchdogArmed) {
          watchdogArmed = true
          cancelWatchdog = setTimer(() => {
            if (!firstSdkMessageSeen) {
              log?.warn("claude: no sdk response within timeout", {
                ms: responseTimeoutMs,
              })
            }
          }, responseTimeoutMs)
        }
      },
      setMode: (mode) => {
        const native = toClaudePermissionMode(mode)
        currentMode = native
        // Capture the current query at the time of this setMode call.
        // This guards Finding 3: if a newer restart already happened by the time
        // the rejection fires, current.query !== q and we skip the stale restart.
        const q = current.query
        const attempt = current.query.setPermissionMode?.(native)
        if (attempt === undefined) {
          // SDK without live switching: relaunch with the new mode.
          // The absent-setPermissionMode path is synchronous; restart immediately regardless
          // of whether a session id exists (the new session will simply start fresh).
          restart()
        } else {
          attempt.catch(() => {
            // The SDK refuses some in-place switches (e.g. into bypassPermissions when the
            // process wasn't launched with --dangerously-skip-permissions): relaunch and
            // resume the same claude session with the new mode instead.
            // Guard (Finding 3): if a newer restart already replaced current.query, skip —
            // the new query will get its own setMode if the user switches again.
            if (current.query !== q) return
            // Guard (Finding 2): if system:init hasn't arrived yet we have no session id
            // to resume with, so the conversation would be silently dropped. Defer until
            // the session id is known; the pump picks it up after system:init.
            if (claudeSessionId === undefined) {
              pendingRestartMode = native
            } else {
              restart()
            }
          })
        }
      },
      setModel: (modelId) => {
        // Model is fixed per SDK query (the SDK reads `options.model` at query() time and
        // does not support a live-switch endpoint). To change models we relaunch resuming
        // the same claude session so conversation history is preserved. "default" (no
        // model) is not reachable here — the selector only sends real route ids.
        currentModel = String(modelId)
        restart()
      },
      interrupt: () => {
        void current.query.interrupt()
      },
      close: () => {
        if (closed) return
        closed = true
        disarmWatchdog()
        current.inputStream.end()
        current.abort.abort()
        current.query.close()
      },
    }
  },
})
