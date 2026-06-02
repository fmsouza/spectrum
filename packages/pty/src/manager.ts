import type { SessionError } from "@launchkit/sessions"
import type { AliasName, HarnessId, Session, SessionId } from "@launchkit/types"
import { type Result, isErr, ok } from "@launchkit/utils"
import {
  type PtyInbound,
  type PtyOutbound,
  base64ToBytes,
  encodeData,
  encodeExit,
} from "./protocol"
import type { PtyAdapter, PtyError } from "./pty"
import { createTerminalRegistry } from "./registry"

export interface TerminalLaunchInput {
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Subset of SessionStore the manager needs. */
export interface SessionSink {
  create(input: {
    harnessId: HarnessId
    alias: AliasName
  }): Result<Session, SessionError>
  close(id: SessionId, exitCode: number): Result<Session, SessionError>
}

export interface TerminalManagerDeps {
  readonly pty: PtyAdapter
  readonly sessions: SessionSink
  send(message: PtyOutbound): void
  readonly capBytes: number
  readonly defaultSize: { readonly cols: number; readonly rows: number }
}

export interface TerminalManager {
  launch(
    input: TerminalLaunchInput,
  ): Result<{ readonly sessionId: SessionId }, PtyError | SessionError>
  handleInbound(message: PtyInbound): void
  /** Late-bound by window.ts once the Electrobun RPC exists; replaces the `send` sink. */
  bindSend(send: (message: PtyOutbound) => void): void
}

export const createTerminalManager = (
  deps: TerminalManagerDeps,
): TerminalManager => {
  const registry = createTerminalRegistry(deps.capBytes)
  let sink: (message: PtyOutbound) => void = deps.send
  const send = (message: PtyOutbound): void => sink(message)

  const launch = (
    input: TerminalLaunchInput,
  ): Result<{ readonly sessionId: SessionId }, PtyError | SessionError> => {
    const session = deps.sessions.create({
      harnessId: input.harnessId,
      alias: input.alias,
    })
    if (isErr(session)) return session
    const id = session.value.id

    const handle = deps.pty.open({
      command: input.command,
      args: input.args,
      env: input.env,
      cols: deps.defaultSize.cols,
      rows: deps.defaultSize.rows,
    })
    if (isErr(handle)) return handle
    const pty = handle.value

    registry.add(id, pty)

    pty.onData((chunk) => {
      registry.appendData(id, chunk)
      send(encodeData(id, chunk))
    })
    pty.onExit((code) => {
      registry.markExited(id, code)
      deps.sessions.close(id, code)
      send(encodeExit(id, code))
    })

    return ok({ sessionId: id })
  }

  const handleInbound = (message: PtyInbound): void => {
    const state = registry.get(message.id)
    if (state === undefined) return
    switch (message.type) {
      case "pty-input":
        state.pty.write(base64ToBytes(message.data))
        return
      case "pty-resize":
        state.pty.resize(message.cols, message.rows)
        return
      case "pty-attach":
        send(encodeData(message.id, registry.snapshot(message.id)))
        return
      case "pty-kill":
        state.pty.kill()
        return
      default:
        // Compile-time exhaustiveness: a new PtyInbound variant fails the build here.
        message satisfies never
        return
    }
  }

  const bindSend = (next: (message: PtyOutbound) => void): void => {
    sink = next
  }

  return { launch, handleInbound, bindSend }
}
