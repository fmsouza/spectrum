import type { SessionError } from "@launchkit/sessions"
import type { HarnessId, ModelId, Session, SessionId } from "@launchkit/types"
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
import type { ScrollbackStore } from "./scrollback-store"

export interface TerminalLaunchInput {
  readonly harnessId: HarnessId
  readonly modelId?: ModelId
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly name?: string
  readonly cwd?: string
}

/** Subset of SessionStore the manager needs. */
export interface SessionSink {
  create(input: {
    harnessId: HarnessId
    modelId?: ModelId
    name?: string
    cwd?: string
  }): Result<Session, SessionError>
  close(id: SessionId, exitCode: number): Result<Session, SessionError>
}

export interface TerminalManagerDeps {
  readonly pty: PtyAdapter
  readonly sessions: SessionSink
  readonly scrollback: ScrollbackStore
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
  // Sessions whose harness has NOT been spawned yet: we wait for the webview's first pty-resize so
  // the harness starts at the terminal's real size. Spawning at a placeholder size and resizing
  // afterwards makes the harness's TUI renderer (e.g. Ink) lose track of its draw position, leaving
  // stale/garbled frames — Terminal.app avoids this by spawning at the final size from the start.
  const pending = new Map<SessionId, TerminalLaunchInput>()
  let sink: (message: PtyOutbound) => void = deps.send
  const send = (message: PtyOutbound): void => sink(message)

  const spawnPty = (
    id: SessionId,
    input: TerminalLaunchInput,
    cols: number,
    rows: number,
  ): void => {
    const handle = deps.pty.open({
      command: input.command,
      args: input.args,
      env: input.env,
      cols,
      rows,
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    })
    if (isErr(handle)) {
      const note = new TextEncoder().encode(
        `\r\n[launchkit: failed to start ${input.harnessId}: ${handle.error.kind}]\r\n`,
      )
      send(encodeData(id, note))
      deps.sessions.close(id, 1)
      send(encodeExit(id, 1))
      return
    }
    const pty = handle.value
    registry.add(id, pty)
    pty.onData((chunk) => {
      registry.appendData(id, chunk)
      deps.scrollback.append(id, chunk)
      send(encodeData(id, chunk))
    })
    pty.onExit((code) => {
      registry.markExited(id, code)
      deps.sessions.close(id, code)
      deps.scrollback.close(id)
      send(encodeExit(id, code))
    })
  }

  const launch = (
    input: TerminalLaunchInput,
  ): Result<{ readonly sessionId: SessionId }, PtyError | SessionError> => {
    const session = deps.sessions.create({
      harnessId: input.harnessId,
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    })
    if (isErr(session)) return session
    const id = session.value.id
    // Defer the actual spawn until the first pty-resize (see `pending` above).
    pending.set(id, input)
    return ok({ sessionId: id })
  }

  const handleInbound = (message: PtyInbound): void => {
    const pendingInput = pending.get(message.id)
    if (pendingInput !== undefined) {
      // Not spawned yet: the first resize carries the terminal's real size — spawn there. Other
      // messages (input/attach/kill) before that first resize have nothing to act on; drop them.
      if (message.type === "pty-resize") {
        pending.delete(message.id)
        spawnPty(message.id, pendingInput, message.cols, message.rows)
      } else if (message.type === "pty-kill") {
        pending.delete(message.id)
        deps.sessions.close(message.id, 0)
      }
      return
    }
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
