import { defaultTerminationSignal, detectPlatform } from "@spectrum/platform"
import type { IdGen } from "@spectrum/utils"

/** A parsed JSON-RPC line. Routed by the presence of `id`/`method`/`result`/`error`. */
export type JsonRpcMessage = Record<string, unknown>

/** A server→client request (has both `method` and `id`). */
export interface ServerRequestFrame {
  readonly id: string | number
  readonly method: string
  readonly params: unknown
}

/** A server→client notification (has `method`, no `id`). */
export interface NotificationFrame {
  readonly method: string
  readonly params: unknown
}

/** The framing + correlation core: serializes outgoing frames + routes incoming parsed lines. */
export interface JsonRpcDispatcher {
  /** Send a client→server request; resolves with its `result` (rejects on `error`). */
  request(method: string, params: unknown): Promise<unknown>
  /** Send a client→server notification (no id, no response). */
  notify(method: string, params: unknown): void
  /** Reply to a server→client request with a result. */
  respond(id: string | number, result: unknown): void
  /** Reply to a server→client request with a JSON-RPC error. */
  respondError(id: string | number, code: number, message: string): void
  /** Feed a raw stdout chunk; complete lines are parsed + routed. */
  feed(chunk: string): void
  /** Reject every pending request (on close / process exit). */
  rejectAll(err: Error): void
}

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (err: Error) => void
}

const isRecord = (v: unknown): v is JsonRpcMessage =>
  typeof v === "object" && v !== null

/**
 * Build the dispatcher. `write` is the byte sink (→ child stdin); `idGen` mints request ids (`rpc`
 * prefix). `onNotification`/`onServerRequest` route the two server-initiated frame kinds.
 */
export const createJsonRpcDispatcher = (deps: {
  write: (line: string) => void
  idGen: IdGen
  onNotification?: (n: NotificationFrame) => void
  onServerRequest?: (r: ServerRequestFrame) => void
}): JsonRpcDispatcher => {
  const pending = new Map<string | number, Pending>()
  let buffer = ""

  const send = (frame: JsonRpcMessage): void => {
    deps.write(`${JSON.stringify(frame)}\n`)
  }

  const route = (msg: JsonRpcMessage): void => {
    const hasMethod = typeof msg.method === "string"
    const hasId = msg.id !== undefined
    if (hasMethod && hasId) {
      deps.onServerRequest?.({
        id: msg.id as string | number,
        method: msg.method as string,
        params: msg.params,
      })
      return
    }
    if (hasMethod) {
      deps.onNotification?.({
        method: msg.method as string,
        params: msg.params,
      })
      return
    }
    if (hasId && ("result" in msg || "error" in msg)) {
      const entry = pending.get(msg.id as string | number)
      if (entry === undefined) return
      pending.delete(msg.id as string | number)
      if ("error" in msg && msg.error !== undefined) {
        const error = msg.error as { message?: unknown }
        entry.reject(
          new Error(
            typeof error.message === "string"
              ? error.message
              : "JSON-RPC error",
          ),
        )
      } else {
        entry.resolve(msg.result)
      }
    }
    // else: drop unroutable frames defensively.
  }

  return {
    request: (method, params) =>
      new Promise<unknown>((resolve, reject) => {
        const id = deps.idGen.next("rpc")
        pending.set(id, { resolve, reject })
        send({ jsonrpc: "2.0", id, method, params })
      }),
    notify: (method, params) => {
      send(
        params === undefined
          ? { jsonrpc: "2.0", method }
          : { jsonrpc: "2.0", method, params },
      )
    },
    respond: (id, result) => {
      send({ jsonrpc: "2.0", id, result })
    },
    respondError: (id, code, message) => {
      send({ jsonrpc: "2.0", id, error: { code, message } })
    },
    feed: (chunk) => {
      buffer += chunk
      let nl = buffer.indexOf("\n")
      while (nl !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (line.trim() !== "") {
          try {
            const parsed: unknown = JSON.parse(line)
            if (isRecord(parsed)) route(parsed)
          } catch {
            // Ignore malformed lines defensively.
          }
        }
        nl = buffer.indexOf("\n")
      }
    },
    rejectAll: (err) => {
      for (const entry of pending.values()) entry.reject(err)
      pending.clear()
    },
  }
}

/** A spawned child process the transport drives (the injected effect seam). */
export interface SpawnedChild {
  /** The child's stdin byte sink. */
  readonly writeStdin: (data: string) => void
  /** Subscribe to decoded stdout text. */
  readonly onStdout: (cb: (text: string) => void) => void
  /** Kill the child (idempotent). */
  readonly kill: () => void
}

/** Spawn a child given command/args/cwd/env. Injected so the adapter test fakes it. */
export type SpawnFn = (opts: {
  command: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
}) => SpawnedChild

/** A live transport: the dispatcher + a `close` that kills the child and rejects pending requests. */
export interface JsonRpcTransport {
  readonly dispatcher: JsonRpcDispatcher
  close(): void
}

/**
 * Spawn `codex app-server` and wire it to a dispatcher: child stdout → `dispatcher.feed`, dispatcher
 * `write` → child stdin. `close()` kills the child once and rejects pending requests.
 */
export const createStdioJsonRpcTransport = (deps: {
  spawn: SpawnFn
  command: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  idGen: IdGen
  onNotification?: (n: NotificationFrame) => void
  onServerRequest?: (r: ServerRequestFrame) => void
}): JsonRpcTransport => {
  const child = deps.spawn({
    command: deps.command,
    args: deps.args,
    cwd: deps.cwd,
    env: deps.env,
  })
  const dispatcher = createJsonRpcDispatcher({
    write: child.writeStdin,
    idGen: deps.idGen,
    ...(deps.onNotification ? { onNotification: deps.onNotification } : {}),
    ...(deps.onServerRequest ? { onServerRequest: deps.onServerRequest } : {}),
  })
  child.onStdout((text) => dispatcher.feed(text))
  let closed = false
  return {
    dispatcher,
    close: () => {
      if (closed) return
      closed = true
      dispatcher.rejectAll(new Error("transport closed"))
      child.kill()
    },
  }
}

/**
 * Benign, repeating `codex app-server` stderr lines that LaunchKit drops (forwarding everything else).
 * codex polls the provider's `/models` for its model PICKER, expecting an Ollama-style `{models:[…]}`;
 * the LaunchKit proxy serves the OpenAI-standard `{data:[…]}`, so the refresh fails every ~15s. LaunchKit
 * sets the model explicitly via `thread/start`, so the picker is unused and the warning is pure noise.
 */
export const isCodexStderrNoise = (line: string): boolean =>
  line.includes("failed to refresh available models")

/** The real Bun spawn behind the `SpawnFn` seam — the only `Bun.spawn` call site in this package. */
export const createBunSpawn = (): SpawnFn => (opts) => {
  const proc = Bun.spawn([opts.command, ...opts.args], {
    cwd: opts.cwd,
    env: opts.env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const decoder = new TextDecoder()
  // Forward app-server stderr to ours, line-buffered, minus the known-benign model-refresh noise.
  void (async () => {
    const reader = proc.stderr.getReader()
    let buf = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines)
        if (!isCodexStderrNoise(line)) process.stderr.write(`${line}\n`)
    }
    if (buf.length > 0 && !isCodexStderrNoise(buf)) process.stderr.write(buf)
  })()
  return {
    writeStdin: (data) => {
      proc.stdin.write(data)
      proc.stdin.flush()
    },
    onStdout: (cb) => {
      const reader = proc.stdout.getReader()
      void (async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined) cb(decoder.decode(value, { stream: true }))
        }
      })()
    },
    kill: () => {
      proc.kill(defaultTerminationSignal(detectPlatform()))
    },
  }
}
