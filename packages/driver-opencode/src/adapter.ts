import type { AgentStartInput } from "@launchkit/agent-driver"
import type { ApprovalDecision, PermissionMode } from "@launchkit/agent-events"
import type {
  AdapterCtx,
  AdapterHandle,
  DriverAdapter,
} from "@launchkit/driver-runtime"
import { mapOpencodeEvent, newOpencodeMapState } from "./map-opencode-event"
import {
  type OpencodeConnect,
  type OpencodeConnectConfig,
  buildOpencodeProxyConfig,
} from "./transport"

/**
 * Permission modes supported by the OpenCode adapter.
 * - "manual": user is prompted for every permission (default).
 * - "plan": prompts are routed to OpenCode's plan agent (body gains `agent: "plan"`).
 * - "bypass": permission.updated events are auto-approved with `response: "always"`,
 *   skipping the requestApproval bridge entirely.
 * NOTE: "auto-edits" is NOT included — the permission.updated payload has no verified
 * edit-vs-command discriminator in the current SDK.
 */
export const OPENCODE_SUPPORTED_MODES: readonly PermissionMode[] = [
  "manual",
  "plan",
  "bypass",
]

export interface OpencodeAdapterDeps {
  /** Start/connect `opencode serve` + client (injected; real impl wraps @opencode-ai/sdk). */
  readonly connect: OpencodeConnect
  /**
   * #6573 guard: if no `session.idle` arrives within this many ms after the last activity, finish the
   * root runner as `errored` and reap the server (the subagent-over-REST hang). 0 disables (tests).
   * Defaults to 180_000 in createOpencodeDriver.
   */
  readonly watchdogMs: number
  /** Injected timers so the watchdog is unit-testable. Defaults to global setTimeout/clearTimeout. */
  readonly setTimer?: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>
  readonly clearTimer?: (h: ReturnType<typeof setTimeout>) => void
}

const readConfig = (input: AgentStartInput): OpencodeConnectConfig => {
  const baseUrl = input.env.OPENCODE_BASE_URL
  const config = buildOpencodeProxyConfig(input.env)
  return {
    cwd: input.cwd,
    env: input.env,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(config !== undefined ? { config } : {}),
  }
}

const replyFor = (decision: ApprovalDecision): "once" | "always" | "reject" =>
  decision === "deny"
    ? "reject"
    : decision === "allow-always"
      ? "always"
      : "once"

/**
 * The OpenCode adapter. `start` connects to `opencode serve`, creates the root session, emits the root
 * runner-started, subscribes the GLOBAL SSE bus, and drains it into ctx.emit(mapOpencodeEvent(...)) — the
 * mapper filters by sessionID (the bus is server-wide). `permission.updated` bridges via ctx.requestApproval
 * then replies (once/always/reject). A watchdog finishes the run if it hangs (#6573). The handle controls
 * prompt/abort/close. The drain runs detached; stream errors surface as a runner-finished(errored) (mapper
 * session.error) or the runtime's rejected-start path.
 */
export const createOpencodeAdapter = (
  deps: OpencodeAdapterDeps,
): DriverAdapter => ({
  supportedModes: OPENCODE_SUPPORTED_MODES,
  start: async (input, ctx: AdapterCtx): Promise<AdapterHandle> => {
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h))

    let mode: PermissionMode = input.permissionMode ?? "manual"

    const { client, server } = await deps.connect(readConfig(input))
    const created = await client.session.create({ body: {} })
    const sessionId = created.id
    const state = newOpencodeMapState({
      rootRunnerId: ctx.rootRunnerId,
      rootSessionId: sessionId,
      newRunnerId: ctx.newRunnerId,
    })

    // Root announcement (the mapper only mints sub-runners; see Task 3 note).
    ctx.emit({ type: "runner-started", runnerId: ctx.rootRunnerId })

    // permissionID -> the OpenCode sessionID that raised it, so a reply hits the right REST path.
    const permissionSessions = new Map<string, string>()
    let closed = false

    // #6573 watchdog: arm on activity; fire -> errored + reap.
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const disarm = (): void => {
      if (watchdog !== undefined) {
        clearTimer(watchdog)
        watchdog = undefined
      }
    }
    const arm = (): void => {
      if (deps.watchdogMs <= 0 || closed) return
      disarm()
      watchdog = setTimer(() => {
        if (closed) return
        ctx.emit({
          type: "runner-finished",
          runnerId: ctx.rootRunnerId,
          status: "errored",
          error: `opencode session stalled (no session.idle within ${deps.watchdogMs}ms; possible subagent-over-REST hang #6573)`,
        })
        server?.close()
      }, deps.watchdogMs)
    }

    const subscription = await client.event.subscribe()

    // Detached drain of the (directory-scoped) bus, filtered by the mapper.
    void (async () => {
      for await (const event of subscription.stream) {
        if (closed) return
        arm()
        if (event.type === "permission.updated") {
          // In scope only if the mapper would emit an approval-requested (i.e. a known session).
          const sess = event.properties.sessionID
          const runner = state.sessions.get(sess)
          if (runner !== undefined) {
            permissionSessions.set(event.properties.id, sess)
            if (mode === "bypass") {
              // Bypass: auto-approve with "always" — skip the UI approval card entirely
              // (don't emit approval-requested, don't call requestApproval).
              await client.session.permissions({
                path: { id: sess, permissionID: event.properties.id },
                body: { response: "always" },
              })
            } else {
              // Manual: run mapper (emits approval-requested), then bridge to requestApproval.
              for (const canonical of mapOpencodeEvent(event, state))
                ctx.emit(canonical)
              const decision = await ctx.requestApproval(runner, {
                kind: "command",
                detail:
                  typeof event.properties.pattern === "string"
                    ? event.properties.pattern
                    : event.properties.title,
              })
              await client.session.permissions({
                path: { id: sess, permissionID: event.properties.id },
                body: { response: replyFor(decision) },
              })
            }
          }
          // Skip mapper for unknown sessions (it returns [] anyway).
        } else {
          for (const canonical of mapOpencodeEvent(event, state))
            ctx.emit(canonical)
        }
        if (
          event.type === "session.idle" &&
          event.properties.sessionID === sessionId
        )
          disarm()
      }
    })()

    // Build a prompt body with optional agent field for plan mode.
    const promptBody = (
      text: string,
    ): {
      parts: ReadonlyArray<{ type: "text"; text: string }>
      agent?: string
    } => ({
      parts: [{ type: "text", text }],
      ...(mode === "plan" ? { agent: "plan" } : {}),
    })

    // Initial prompt.
    if (input.initialPrompt !== undefined && input.initialPrompt !== "") {
      arm()
      await client.session.prompt({
        path: { id: sessionId },
        body: promptBody(input.initialPrompt),
      })
    }

    return {
      send: (text) => {
        arm()
        void client.session.prompt({
          path: { id: sessionId },
          body: promptBody(text),
        })
      },
      interrupt: () => {
        void client.session.abort({ path: { id: sessionId } })
      },
      close: () => {
        closed = true
        disarm()
        server?.close()
      },
      setMode: (m) => {
        mode = m
      },
    }
  },
})
