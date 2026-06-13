import type {
  CanonicalEvent,
  PermissionMode,
  StoredEvent,
} from "@spectrum/agent-events"
import type { HarnessId, ModelId, SessionId } from "@spectrum/types"
import { type Clock, type Result, isErr, isOk, ok } from "@spectrum/utils"
import type { AgentDriver, AgentSession, DriverError } from "./driver"
import type { RunEventSink, SessionSink } from "./ports"
import type { RunnerInbound, RunnerOutbound } from "./protocol"

export interface RunLaunchInput {
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  /** The normalized permission mode the session starts in; absent = the driver's default ("manual"). */
  readonly permissionMode?: PermissionMode
  readonly name?: string
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly initialPrompt?: string
  /** The harness-resolved absolute executable, forwarded to `driver.start` (see `AgentStartInput.command`). */
  readonly command?: string
  /** The harness-resolved launch args, forwarded to `driver.start` (see `AgentStartInput.args`). */
  readonly args?: readonly string[]
}

export interface RunManagerDeps {
  readonly driver: AgentDriver
  readonly sessions: SessionSink
  readonly events: RunEventSink
  readonly clock: Clock
  send(message: RunnerOutbound): void
}

export interface RunManager {
  launch(
    input: RunLaunchInput,
  ): Result<{ readonly sessionId: SessionId }, DriverError>
  handleInbound(message: RunnerInbound): void
  /** Late-bound once the runner socket connects; replaces the `send` sink. */
  bindSend(send: (message: RunnerOutbound) => void): void
}

export const createRunManager = (deps: RunManagerDeps): RunManager => {
  const live = new Map<SessionId, AgentSession>()
  let sink: (message: RunnerOutbound) => void = deps.send
  const send = (message: RunnerOutbound): void => sink(message)

  const launch = (
    input: RunLaunchInput,
  ): Result<{ readonly sessionId: SessionId }, DriverError> => {
    const session = deps.sessions.create({
      harnessId: input.harnessId,
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      cwd: input.cwd,
    })
    if (isErr(session))
      return {
        ok: false,
        error: {
          kind: "start-failed",
          detail: session.error.detail ?? session.error.kind,
        },
      }
    const id = session.value.id

    const started = deps.driver.start({
      harnessId: input.harnessId,
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.permissionMode !== undefined
        ? { permissionMode: input.permissionMode }
        : {}),
      cwd: input.cwd,
      env: input.env,
      ...(input.initialPrompt !== undefined
        ? { initialPrompt: input.initialPrompt }
        : {}),
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.args !== undefined ? { args: input.args } : {}),
    })
    if (isErr(started)) {
      deps.sessions.close(id, 1)
      return started
    }
    const agent = started.value
    live.set(id, agent)

    // Persist-then-forward fan-out (mirrors TerminalManager's onData → scrollback.append + send).
    agent.onEvent((event: CanonicalEvent) => {
      const appended = deps.events.append(id, event)
      if (isOk(appended)) {
        const stored: StoredEvent = {
          seq: appended.value.seq,
          sessionId: id,
          ts: deps.clock.now().toISOString(),
          event,
        }
        send({ type: "runner-event", id, event: stored })
      }
      // Close is intentionally independent of persist success: the session must be
      // marked finished in the DB even if the final event failed to append to the store.
      if (
        event.type === "runner-finished" &&
        event.runnerId === agent.rootRunnerId
      ) {
        deps.sessions.close(id, 0)
      }
    })
    return ok({ sessionId: id })
  }

  const handleInbound = (message: RunnerInbound): void => {
    if (message.type === "run-attach") {
      // `events.read` is called unconditionally. For an unknown/never-launched sessionId
      // it returns an empty backlog (or a handled error), so nothing is replayed — safe no-op.
      const read = deps.events.read(message.id)
      if (isOk(read)) {
        for (const stored of read.value) {
          send({ type: "runner-event", id: message.id, event: stored })
        }
      }
      return
    }
    const agent = live.get(message.id)
    if (agent === undefined) return
    // The runner socket protocol has no error-reply frame, so Results from these commands
    // are intentionally dropped here. Driver failures are surfaced as canonical events
    // through onEvent (e.g. a runner-finished with status "errored") which flow through
    // the normal persist+forward path.
    switch (message.type) {
      case "run-send":
        agent.send({ text: message.text })
        return
      case "run-approve":
        agent.respondApproval(message.requestId, message.decision)
        return
      case "run-interrupt":
        agent.interrupt()
        return
      case "run-set-mode":
        agent.setMode?.(message.mode)
        return
      case "run-set-model":
        agent.setModel?.(message.modelId)
        return
      default:
        // Compile-time exhaustiveness: a new RunnerInbound variant fails the build here.
        message satisfies never
        return
    }
  }

  const bindSend = (next: (message: RunnerOutbound) => void): void => {
    sink = next
  }

  return { launch, handleInbound, bindSend }
}
