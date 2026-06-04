# Embedded Harness Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Follow `build-plan/01-conventions/*` (TypeScript strict, NO `any`, explicit input/output types, functional style, `Result<T,E>` over throwing, effects behind injected adapters, `@launchkit/<pkg>` imports only). Gate after each task: `bun run typecheck && bun run lint && bun test`.

**Goal:** Make GUI **Launch** open the harness in an embedded, interactive terminal (tabbed, multiple concurrent) inside the LaunchKit window, instead of spawning a headless process the user can't reach.

**Architecture:** A new `@launchkit/pty` package holds pure session logic (registry, scrollback ring buffer, message-protocol codec, terminal manager) plus an effectful `bun:ffi` PTY adapter (`openpty` + `Bun.spawn` on the slave fd — proven feasible). The bun process streams pty bytes to the webview over Electrobun's `messages` channel (localhost WebSocket, already CSP-permitted); the webview renders with `xterm.js` in a new Terminal route with a tab strip. GUI launch routes through the pty manager; the CLI keeps its inherit-stdio foreground launcher unchanged.

**Tech Stack:** Bun + `bun:ffi`, Electrobun v1.18 `messages` RPC channel, React + `@xterm/xterm` + `@xterm/addon-fit`, zod, `bun test`.

**Spec:** `docs/superpowers/specs/2026-06-02-embedded-harness-terminal-design.md`. Read it first.

---

## Shared contracts (defined once, used across tasks — keep names exact)

```ts
// @launchkit/pty — public types (Task 1 + Task 4)
import type { SessionId } from "@launchkit/types"

export type PtyError =
  | { readonly kind: "open-failed"; readonly detail: string }
  | { readonly kind: "not-found"; readonly id: SessionId }

/** Opened pseudo-terminal handle (one per running harness). */
export interface PtyHandle {
  write(data: Uint8Array): void
  resize(cols: number, rows: number): void
  onData(cb: (chunk: Uint8Array) => void): void
  onExit(cb: (code: number) => void): void
  kill(): void
}

export interface PtyOpenOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
}

import type { Result } from "@launchkit/utils"
export interface PtyAdapter {
  open(opts: PtyOpenOptions): Result<PtyHandle, PtyError>
}

/** Messages over the Electrobun `messages` channel (zod-validated both ends). `data` is base64. */
export type PtyOutbound =                      // bun -> webview
  | { readonly type: "pty-data"; readonly id: SessionId; readonly data: string }
  | { readonly type: "pty-exit"; readonly id: SessionId; readonly code: number }
export type PtyInbound =                        // webview -> bun
  | { readonly type: "pty-input"; readonly id: SessionId; readonly data: string }
  | { readonly type: "pty-resize"; readonly id: SessionId; readonly cols: number; readonly rows: number }
  | { readonly type: "pty-attach"; readonly id: SessionId }
  | { readonly type: "pty-kill"; readonly id: SessionId }
```

The terminal manager surface (Task 5):

```ts
export interface TerminalLaunchInput {
  readonly harnessId: HarnessId
  readonly alias: AliasName
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}
export interface TerminalManager {
  launch(input: TerminalLaunchInput): Result<{ readonly sessionId: SessionId }, PtyError | SessionError>
  handleInbound(message: PtyInbound): void   // routes pty-input/resize/attach/kill
}
```

---

## Phase 0 — package scaffold

### Task 0: Create the `@launchkit/pty` package

**Files:**
- Create: `packages/pty/package.json`, `packages/pty/tsconfig.json`, `packages/pty/src/index.ts`

- [ ] **Step 1:** Invoke the `launchkit-new-package` skill and follow it, OR copy the shape of an existing leaf package (e.g. `packages/sessions/package.json` + `tsconfig.json`). Create `packages/pty/package.json`:

```json
{
  "name": "@launchkit/pty",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": {
    "@launchkit/types": "workspace:*",
    "@launchkit/utils": "workspace:*",
    "@launchkit/sessions": "workspace:*",
    "zod": "^3.25.76"
  }
}
```

- [ ] **Step 2:** Create `packages/pty/tsconfig.json` mirroring `packages/sessions/tsconfig.json` (extends the shared `@launchkit/tsconfig`).
- [ ] **Step 3:** Create `packages/pty/src/index.ts` with a placeholder export `export const PTY_PACKAGE = "pty" as const` (replaced by the real barrel in Task 6).
- [ ] **Step 4:** Run `bun install` then `bun run typecheck`. Expected: green; the new package resolves.
- [ ] **Step 5: Commit**

```bash
git add packages/pty bun.lock
git commit -m "feat(pty): scaffold @launchkit/pty package [terminal-0]"
```

---

## Phase 1 — pure core (TDD, fully unit-tested)

### Task 1: PTY types + `createFakePty`

**Files:**
- Create: `packages/pty/src/pty.ts`, `packages/pty/src/pty.test.ts`

- [ ] **Step 1: Write the failing test** (`pty.test.ts`):

```ts
import { describe, expect, it } from "bun:test"
import { createFakePty } from "./pty"

describe("createFakePty", () => {
  it("emits scripted data to the onData callback", () => {
    const pty = createFakePty()
    const chunks: string[] = []
    pty.onData((c) => chunks.push(new TextDecoder().decode(c)))
    pty.emit("hello")
    expect(chunks).toEqual(["hello"])
  })

  it("records writes and resizes", () => {
    const pty = createFakePty()
    pty.write(new TextEncoder().encode("ls\n"))
    pty.resize(120, 40)
    expect(pty.writes.map((w) => new TextDecoder().decode(w))).toEqual(["ls\n"])
    expect(pty.resizes).toEqual([{ cols: 120, rows: 40 }])
  })

  it("fires onExit with the code when killed or exited", () => {
    const pty = createFakePty()
    let code: number | null = null
    pty.onExit((c) => { code = c })
    pty.triggerExit(137)
    expect(code).toBe(137)
  })
})
```

- [ ] **Step 2: Run** `bun test packages/pty/src/pty.test.ts` — Expected: FAIL (module/exports missing).

- [ ] **Step 3: Implement** `pty.ts`. Put the shared `PtyError`/`PtyHandle`/`PtyOpenOptions`/`PtyAdapter` types here (from the Shared contracts block). Add the fake:

```ts
export interface FakePty extends PtyHandle {
  readonly writes: readonly Uint8Array[]
  readonly resizes: readonly { cols: number; rows: number }[]
  emit(text: string): void
  triggerExit(code: number): void
}

export const createFakePty = (): FakePty => {
  const writes: Uint8Array[] = []
  const resizes: { cols: number; rows: number }[] = []
  let dataCb: ((c: Uint8Array) => void) | null = null
  let exitCb: ((code: number) => void) | null = null
  return {
    writes, resizes,
    write: (d) => { writes.push(d) },
    resize: (cols, rows) => { resizes.push({ cols, rows }) },
    onData: (cb) => { dataCb = cb },
    onExit: (cb) => { exitCb = cb },
    kill: () => { exitCb?.(0) },
    emit: (text) => dataCb?.(new TextEncoder().encode(text)),
    triggerExit: (code) => exitCb?.(code),
  }
}
```

- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `git add packages/pty/src/pty.ts packages/pty/src/pty.test.ts && git commit -m "feat(pty): pty types + fake pty [terminal-1]"`

### Task 2: Bounded scrollback ring buffer

**Files:**
- Create: `packages/pty/src/scrollback.ts`, `packages/pty/src/scrollback.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "bun:test"
import { createScrollback } from "./scrollback"

const dec = (u: Uint8Array): string => new TextDecoder().decode(u)

describe("createScrollback", () => {
  it("accumulates appended chunks and returns them as one snapshot", () => {
    const sb = createScrollback(1024)
    sb.append(new TextEncoder().encode("abc"))
    sb.append(new TextEncoder().encode("def"))
    expect(dec(sb.snapshot())).toBe("abcdef")
  })

  it("drops the oldest bytes when the byte cap is exceeded", () => {
    const sb = createScrollback(4) // 4-byte cap
    sb.append(new TextEncoder().encode("abcdef"))
    expect(dec(sb.snapshot())).toBe("cdef")
  })
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `scrollback.ts` — a byte-capped buffer (cap defaults set by caller; the manager uses ~5,000 lines ≈ 1 MB; here it's parameterized in bytes):

```ts
export interface Scrollback {
  append(chunk: Uint8Array): void
  snapshot(): Uint8Array
}

export const createScrollback = (capBytes: number): Scrollback => {
  let buf = new Uint8Array(0)
  return {
    append: (chunk) => {
      const combined = new Uint8Array(buf.length + chunk.length)
      combined.set(buf); combined.set(chunk, buf.length)
      buf = combined.length > capBytes ? combined.subarray(combined.length - capBytes) : combined
    },
    snapshot: () => buf,
  }
}
```

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add packages/pty/src/scrollback.ts packages/pty/src/scrollback.test.ts && git commit -m "feat(pty): bounded scrollback ring buffer [terminal-2]"`

### Task 3: Terminal registry

**Files:**
- Create: `packages/pty/src/registry.ts`, `packages/pty/src/registry.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { createFakePty } from "./pty"
import { createTerminalRegistry } from "./registry"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("createTerminalRegistry", () => {
  it("registers a session with its pty and marks it running", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    expect(reg.get(id)?.status).toBe("running")
  })

  it("accumulates scrollback from appended data and replays it via snapshot", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    reg.appendData(id, new TextEncoder().encode("output"))
    expect(new TextDecoder().decode(reg.snapshot(id))).toBe("output")
  })

  it("marks a session exited with its code and keeps it queryable", () => {
    const reg = createTerminalRegistry(1024)
    reg.add(id, createFakePty())
    reg.markExited(id, 0)
    expect(reg.get(id)?.status).toBe("exited")
    expect(reg.get(id)?.exitCode).toBe(0)
  })
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `registry.ts`:

```ts
import type { SessionId } from "@launchkit/types"
import type { PtyHandle } from "./pty"
import { type Scrollback, createScrollback } from "./scrollback"

export interface TerminalState {
  readonly pty: PtyHandle
  readonly scrollback: Scrollback
  status: "running" | "exited"
  exitCode: number | null
}
export interface TerminalRegistry {
  add(id: SessionId, pty: PtyHandle): void
  get(id: SessionId): TerminalState | undefined
  appendData(id: SessionId, chunk: Uint8Array): void
  markExited(id: SessionId, code: number): void
  snapshot(id: SessionId): Uint8Array
  remove(id: SessionId): void
}

export const createTerminalRegistry = (capBytes: number): TerminalRegistry => {
  const map = new Map<SessionId, TerminalState>()
  return {
    add: (id, pty) => { map.set(id, { pty, scrollback: createScrollback(capBytes), status: "running", exitCode: null }) },
    get: (id) => map.get(id),
    appendData: (id, chunk) => map.get(id)?.scrollback.append(chunk),
    markExited: (id, code) => { const s = map.get(id); if (s) { s.status = "exited"; s.exitCode = code } },
    snapshot: (id) => map.get(id)?.scrollback.snapshot() ?? new Uint8Array(0),
    remove: (id) => { map.delete(id) },
  }
}
```

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add packages/pty/src/registry.ts packages/pty/src/registry.test.ts && git commit -m "feat(pty): terminal session registry [terminal-3]"`

### Task 4: Message-protocol codec

**Files:**
- Create: `packages/pty/src/protocol.ts`, `packages/pty/src/protocol.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "bun:test"
import { SessionIdSchema } from "@launchkit/types"
import { decodeInbound, encodeData, encodeExit } from "./protocol"

const id = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")

describe("pty protocol", () => {
  it("encodes pty output bytes as a base64 pty-data message", () => {
    const msg = encodeData(id, new TextEncoder().encode("hi"))
    expect(msg).toEqual({ type: "pty-data", id, data: btoa("hi") })
  })

  it("encodes an exit message with the code", () => {
    expect(encodeExit(id, 2)).toEqual({ type: "pty-exit", id, code: 2 })
  })

  it("decodes a valid pty-input message", () => {
    const parsed = decodeInbound({ type: "pty-input", id, data: btoa("ls\n") })
    expect(parsed.ok && parsed.value).toEqual({ type: "pty-input", id, data: btoa("ls\n") })
  })

  it("rejects a malformed inbound message", () => {
    expect(decodeInbound({ type: "nope" }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `protocol.ts` — zod schemas for `PtyInbound`, encoders for outbound, and a `decodeInbound(raw) → Result<PtyInbound, …>` plus base64 helpers (`bytesToBase64`/`base64ToBytes` using `btoa`/`atob` over a binary string, since the data is arbitrary bytes). Keep `PtyOutbound`/`PtyInbound` types here (from Shared contracts). Use `SessionIdSchema` from `@launchkit/types`.

```ts
import { type SessionId, SessionIdSchema } from "@launchkit/types"
import { type Result, err, ok } from "@launchkit/utils"
import { z } from "zod"

export const bytesToBase64 = (b: Uint8Array): string => {
  let s = ""; for (const byte of b) s += String.fromCharCode(byte); return btoa(s)
}
export const base64ToBytes = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const encodeData = (id: SessionId, bytes: Uint8Array): PtyOutbound =>
  ({ type: "pty-data", id, data: bytesToBase64(bytes) })
export const encodeExit = (id: SessionId, code: number): PtyOutbound =>
  ({ type: "pty-exit", id, code })

const InboundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pty-input"), id: SessionIdSchema, data: z.string() }),
  z.object({ type: z.literal("pty-resize"), id: SessionIdSchema, cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("pty-attach"), id: SessionIdSchema }),
  z.object({ type: z.literal("pty-kill"), id: SessionIdSchema }),
])
export const decodeInbound = (raw: unknown): Result<PtyInbound, { kind: "bad-message" }> => {
  const parsed = InboundSchema.safeParse(raw)
  return parsed.success ? ok(parsed.data) : err({ kind: "bad-message" })
}
```

(Put the `PtyOutbound`/`PtyInbound` type declarations from the Shared contracts block at the top of this file or in `pty.ts`; import as needed so there is one definition.)

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add packages/pty/src/protocol.ts packages/pty/src/protocol.test.ts && git commit -m "feat(pty): zod-validated terminal message protocol [terminal-4]"`

### Task 5: Terminal manager (the orchestrator)

**Files:**
- Create: `packages/pty/src/manager.ts`, `packages/pty/src/manager.test.ts`

- [ ] **Step 1: Write the failing test** (fake pty + recording send + fake session sink):

```ts
import { describe, expect, it } from "bun:test"
import { AliasNameSchema, HarnessIdSchema, SessionIdSchema } from "@launchkit/types"
import { ok } from "@launchkit/utils"
import { createFakePty } from "./pty"
import { createTerminalManager } from "./manager"
import { bytesToBase64 } from "./protocol"

const makeDeps = () => {
  const sent: unknown[] = []
  const closed: { id: string; code: number }[] = []
  const sessionId = SessionIdSchema.parse("s_00000000-0000-4000-8000-000000000000")
  const pty = createFakePty()
  return {
    sent, closed, pty, sessionId,
    deps: {
      pty: { open: () => ok(pty) },
      send: (m: unknown) => { sent.push(m) },
      sessions: {
        create: () => ok({ id: sessionId, harnessId: HarnessIdSchema.parse("claude"), alias: AliasNameSchema.parse("default"), startedAt: "t", exitCode: null }),
        close: (id: string, code: number) => { closed.push({ id, code }); return ok({} as never) },
      },
      capBytes: 1024,
      defaultSize: { cols: 80, rows: 24 },
    },
  }
}

const launchInput = {
  harnessId: HarnessIdSchema.parse("claude"),
  alias: AliasNameSchema.parse("default"),
  command: "/bin/claude", args: [] as string[], env: { PATH: "/usr/bin" },
}

describe("createTerminalManager", () => {
  it("creates a session and opens a pty on launch, returning the sessionId", () => {
    const { deps, sessionId } = makeDeps()
    const mgr = createTerminalManager(deps)
    const res = mgr.launch(launchInput)
    expect(res.ok && res.value.sessionId).toBe(sessionId)
  })

  it("streams pty output to the webview as base64 pty-data messages", () => {
    const { deps, pty, sent, sessionId } = makeDeps()
    const mgr = createTerminalManager(deps)
    mgr.launch(launchInput)
    pty.emit("xyz")
    expect(sent).toContainEqual({ type: "pty-data", id: sessionId, data: bytesToBase64(new TextEncoder().encode("xyz")) })
  })

  it("forwards pty-input keystrokes to the pty", () => {
    const { deps, pty, sessionId } = makeDeps()
    const mgr = createTerminalManager(deps)
    mgr.launch(launchInput)
    mgr.handleInbound({ type: "pty-input", id: sessionId, data: bytesToBase64(new TextEncoder().encode("a")) })
    expect(pty.writes.map((w) => new TextDecoder().decode(w))).toEqual(["a"])
  })

  it("replays scrollback on attach", () => {
    const { deps, pty, sent, sessionId } = makeDeps()
    const mgr = createTerminalManager(deps)
    mgr.launch(launchInput)
    pty.emit("history")
    sent.length = 0
    mgr.handleInbound({ type: "pty-attach", id: sessionId })
    expect(sent[0]).toEqual({ type: "pty-data", id: sessionId, data: bytesToBase64(new TextEncoder().encode("history")) })
  })

  it("closes the session with the exit code and emits pty-exit when the harness exits", () => {
    const { deps, pty, sent, closed, sessionId } = makeDeps()
    const mgr = createTerminalManager(deps)
    mgr.launch(launchInput)
    pty.triggerExit(3)
    expect(closed).toEqual([{ id: sessionId, code: 3 }])
    expect(sent).toContainEqual({ type: "pty-exit", id: sessionId, code: 3 })
  })
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `manager.ts`. The manager: on `launch`, calls `sessions.create({harnessId, alias})` → opens the pty with the resolved command/env/size → registers it → wires `pty.onData` (append scrollback + `send(encodeData)`) and `pty.onExit` (`registry.markExited` + `sessions.close(id, code)` + `send(encodeExit)`). `handleInbound` routes input→`pty.write(base64ToBytes)`, resize→`pty.resize`, attach→`send(encodeData(id, registry.snapshot))`, kill→`pty.kill`. Define `ManagerDeps` (pty adapter, `send`, a `SessionSink = { create, close }`, capBytes, defaultSize). Return `Result` from `launch` (propagate session/pty errors). No `any`.

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git add packages/pty/src/manager.ts packages/pty/src/manager.test.ts && git commit -m "feat(pty): terminal manager wiring pty<->webview<->sessions [terminal-5]"`

### Task 6: Barrel + package CLAUDE.md

**Files:**
- Modify: `packages/pty/src/index.ts`
- Create: `packages/pty/CLAUDE.md`

- [ ] **Step 1:** Replace `index.ts` placeholder with the real barrel: re-export public types + `createFakePty`, `createTerminalRegistry`, `createScrollback`, protocol encoders/`decodeInbound`/base64 helpers, `createTerminalManager` and its dep types. (The FFI adapter from Task 7 is added here too.)
- [ ] **Step 2:** Write `packages/pty/CLAUDE.md` (responsibility, public API, deps `@launchkit/types,utils,sessions`, effect owned = pty via FFI, local rules: stream never buffer beyond the bounded scrollback; macOS-only FFI behind the adapter).
- [ ] **Step 3:** Gate `bun run typecheck && bun run lint && bun test`. Expected: green.
- [ ] **Step 4: Commit** `git add packages/pty/src/index.ts packages/pty/CLAUDE.md && git commit -m "feat(pty): barrel + CLAUDE.md [terminal-6]"`

---

## Phase 2 — real FFI PTY adapter (integration)

### Task 7: `createFfiPty` (bun:ffi openpty + Bun.spawn on the slave)

**Files:**
- Create: `packages/pty/src/ffi-pty.ts`, `packages/pty/src/ffi-pty.integration.test.ts`
- Modify: `packages/pty/src/index.ts` (export `createFfiPty`)

This adapter is effectful; verify it with a real integration test (the proven spike shape). The recipe (validated 2026-06-02): `dlopen("libutil.dylib", { openpty })`, allocate `Int32Array(1)` master+slave, `openpty(ptr(master), ptr(slave), null, null, null)` returns 0; `Bun.spawn([command, ...args], { stdio: [slave, slave, slave], env })`; read the master fd; `child.exited` → onExit. For non-blocking streaming, set the master fd non-blocking via `fcntl(master, F_SETFL, O_NONBLOCK)` (libSystem) and drain on a short `setInterval` using FFI `read`; stop the interval on exit. `write` via FFI `write(master, ptr(bytes), len)`. `resize` via `ioctl(master, TIOCSWINSZ, ptr(winsize))` where `winsize` is `{ ws_row:u16, ws_col:u16, ws_xpixel:u16, ws_ypixel:u16 }` (8 bytes; macOS `TIOCSWINSZ = 0x80087467`). `kill` via `child.kill()`.

- [ ] **Step 1: Write the failing integration test** (`ffi-pty.integration.test.ts`):

```ts
import { describe, expect, it } from "bun:test"
import { createFfiPty } from "./ffi-pty"

describe("createFfiPty (real pty, macOS)", () => {
  it("gives the child a real TTY and streams its output", async () => {
    const adapter = createFfiPty()
    const opened = adapter.open({
      command: "/bin/sh",
      args: ["-c", "tty; echo IS_TTY=$?"],
      env: { ...process.env } as Record<string, string>,
      cols: 80, rows: 24,
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const out: string[] = []
    const exit = new Promise<number>((res) => opened.value.onExit(res))
    opened.value.onData((c) => out.push(new TextDecoder().decode(c)))
    const code = await exit
    const text = out.join("")
    expect(text).toContain("/dev/ttys")    // it is a real TTY
    expect(text).toContain("IS_TTY=0")
    expect(code).toBe(0)
  })

  it("returns open-failed for an unspawnable command", () => {
    const res = createFfiPty().open({ command: "/no/such/bin", args: [], env: {}, cols: 80, rows: 24 })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `bun test packages/pty/src/ffi-pty.integration.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `ffi-pty.ts` per the recipe above. Wrap `dlopen`/`openpty`/`Bun.spawn` in try/catch → `err({kind:"open-failed", detail})`. Implement the non-blocking drain loop (interval ~10ms; `read` returns ≤0 / EAGAIN → skip; >0 → slice + `onData`). Clean up: clear the interval and close fds on exit. Keep all FFI symbol definitions local; explicit types; no `any` (use `unknown` + narrowing for ffi return values).
- [ ] **Step 4: Run** — Expected: PASS (real TTY output, exit 0; the bad-command case returns err).
- [ ] **Step 5:** Export `createFfiPty` from the barrel. Gate `bun run typecheck && bun run lint && bun test`. Expected: green.
- [ ] **Step 6: Commit** `git add packages/pty/src/ffi-pty.ts packages/pty/src/ffi-pty.integration.test.ts packages/pty/src/index.ts && git commit -m "feat(pty): real bun:ffi openpty adapter + integration test [terminal-7]"`

---

## Phase 3 — bun-side wiring (apps/desktop)

### Task 8: Extract reusable harness launch resolution

**Files:**
- Modify: `packages/harnesses/src/launch.ts` (extract `resolveHarnessLaunch`)
- Create/Modify test: `packages/harnesses/src/launch.test.ts`

The pty manager needs the resolved `{command, args, env}` without spawning. Extract the resolution out of `launchHarness` so both the spawner path and the pty path reuse it.

- [ ] **Step 1: Write the failing test:** add a test asserting `resolveHarnessLaunch(deps)(params)` returns `ok({ command, args, env })` with the env template rendered (proxyUrl/proxyKey/model) and the command resolved — without spawning (pass a resolver fake; no spawner needed).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** extract `resolveHarnessLaunch = (deps:{resolver}) => (params: LaunchParams): Result<{command:string; args:readonly string[]; env:Record<string,string>}, HarnessError>` containing steps 1–3 of the current `launchHarness` (validate template, resolve command, render env; `args` is `[]`). Re-implement `launchHarness` to call `resolveHarnessLaunch` then `spawner.spawn(command, args, env)`. Export `resolveHarnessLaunch` from the barrel.
- [ ] **Step 4: Run** the harnesses tests — Expected: green (existing launch behavior unchanged).
- [ ] **Step 5: Commit** `git add packages/harnesses/src/launch.ts packages/harnesses/src/launch.test.ts packages/harnesses/src/index.ts && git commit -m "refactor(harnesses): extract resolveHarnessLaunch for reuse by the pty path [terminal-8]"`

### Task 9: Wire the terminal manager into the composition root

**Files:**
- Modify: `apps/desktop/src/composition.ts`, `apps/desktop/src/composition.test.ts`

- [ ] **Step 1: Write the failing test:** assert `createAppContext(...)` exposes `terminal` and that it is constructed (a wiring assertion mirroring the existing composition tests — e.g. `ctx.terminal` is defined and has a `launch` function). The `send` sink is injected later by `window.ts`; here the manager is built with a `setSend`-style indirection OR the manager exposes a settable sink. Simplest: `createTerminalManager` takes a `send` that the composition initializes to a no-op and `window.ts` overrides — OR expose `ctx.terminal` plus a `ctx.setTerminalSend(fn)`. Choose: add `bindSend(send)` to `TerminalManager` (called by window.ts once the window's RPC exists). Update Task 5's manager to support `bindSend` (the test there can set it directly) — if you add it, also add a manager test `it("uses the bound send sink")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** in `composition.ts`, build `const terminal = createTerminalManager({ pty: createFfiPty(), send: noopSend, sessions: { create: sessions.create, close: sessions.close }, capBytes: 1_000_000, defaultSize: { cols: 80, rows: 24 } })` and expose `terminal` on `AppContext` (add to the type + return). Keep it injected via `CreateAppContextDeps` (add `createFfiPty`, `createTerminalManager`) for testability with a fake pty.
- [ ] **Step 4: Run** the gate — Expected: green.
- [ ] **Step 5: Commit** `git add apps/desktop/src/composition.ts apps/desktop/src/composition.test.ts packages/pty/src/manager.ts packages/pty/src/manager.test.ts && git commit -m "feat(desktop): build the terminal manager in the composition root [terminal-9]"`

### Task 10: Electrobun `messages` transport seam in `window.ts`

**Files:**
- Modify: `apps/desktop/src/gui/window.ts`, `apps/desktop/src/gui/window.test.ts`

Wire the bidirectional `messages` channel: inbound webview messages → `ctx.terminal.handleInbound`; bind the outbound `send` to push `messages` to the webview. This is an Electrobun seam — keep the decision logic (decode + route) in a tested pure function; the Electrobun calls live behind the injected `realOpenWindowDeps`.

- [ ] **Step 1: Write the failing test:** a pure `routeInboundMessage(raw, terminal)` that `decodeInbound`s and calls `terminal.handleInbound` on success / ignores on failure. Test: valid message routed; malformed dropped (no throw).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** add `routeInboundMessage`. In `realOpenWindowDeps.createWindow`, when building `defineElectrobunRPC`, pass a `messages` handler whose entries call `routeInboundMessage(payload, ctx.terminal)`, and after the `BrowserWindow` is created, call `ctx.terminal.bindSend((msg) => rpc.send(msg))` (Electrobun's bun-side `rpc.send` pushes to the webview — see `node_modules/electrobun/dist/api/bun/core/BrowserView.ts` `send`). **Confirm the exact `messages` handler + `send` shape against the installed electrobun** and adapt only this seam (the project already wraps the RPC behind `OpenWindowDeps`). `openWindow` must receive `ctx` (it already does) to reach `ctx.terminal`.
- [ ] **Step 4: Run** the gate — Expected: green (the pure router is tested; the Electrobun calls are covered by the manual run).
- [ ] **Step 5: Commit** `git add apps/desktop/src/gui/window.ts apps/desktop/src/gui/window.test.ts && git commit -m "feat(desktop): electrobun messages seam routes pty stream to/from the terminal manager [terminal-10]"`

### Task 11: GUI launch routes through the terminal manager

**Files:**
- Modify: `apps/desktop/src/gui/ipc/handlers.ts`, `apps/desktop/src/gui/tray.ts`, their tests; possibly `packages/ipc` `launchHarness` result schema

- [ ] **Step 1: Write the failing test** (`handlers.test.ts`): `launchHarness` resolves the harness + env (via `resolveHarnessLaunch` using the registry + proxy settings) and calls `ctx.terminal.launch({ harnessId, alias, command, args, env })`, returning `{ sessionId }`. Use a fake `ctx.terminal` recording the launch input. Assert the env contains the rendered proxy vars and that the result carries the session id. (If the IPC `launchHarness` result schema currently returns a pid/session shape, update `LaunchHarnessResultSchema` to `{ sessionId: SessionId }` and adjust the webview client type.)
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** in the GUI `launchHarness` handler, replace the headless `ctx.launch(...)` call with: resolve alias + proxy base URL + per-run key (reuse the existing proxy/runtime wiring), `resolveHarnessLaunch` → `{command,args,env}`, then `ctx.terminal.launch({harnessId, alias, command, args, env})`; return `{ sessionId }`. Do the same for the tray Launch click (`tray.ts` `launchById`) — launch via the terminal manager and trigger the window to open/focus the new tab (open the window if closed). The CLI path is untouched.
- [ ] **Step 4: Run** the gate — Expected: green.
- [ ] **Step 5: Commit** `git add apps/desktop/src/gui/ipc/handlers.ts apps/desktop/src/gui/tray.ts apps/desktop/src/gui/ipc/handlers.test.ts apps/desktop/src/gui/tray.test.ts packages/ipc && git commit -m "feat(desktop): GUI launch opens an embedded terminal session [terminal-11]"`

---

## Phase 4 — webview UI

### Task 12: xterm deps + `useTerminals` hook (message client)

**Files:**
- Modify: `apps/desktop/package.json` (add `@xterm/xterm`, `@xterm/addon-fit`)
- Create: `apps/desktop/views/main/terminal/useTerminals.ts`, `...useTerminals.test.ts`

- [ ] **Step 1:** Add deps: `bun add --cwd apps/desktop @xterm/xterm @xterm/addon-fit`. Verify they install.
- [ ] **Step 2: Write the failing test** (`useTerminals.test.ts`) for the pure transport logic, not the DOM xterm: a `createTerminalClient(send)` that exposes `attach(id)`, `sendInput(id, bytes)`, `sendResize(id, cols, rows)`, `kill(id)` and a `dispatch(rawOutboundMessage)` that routes `pty-data`→`onData(id, bytes)` and `pty-exit`→`onExit(id, code)` to registered listeners. Test: `sendInput` emits a base64 `pty-input` message via `send`; `dispatch(pty-data)` decodes base64 and calls the data listener; `dispatch(pty-exit)` calls the exit listener.
- [ ] **Step 3: Run** — Expected: FAIL.
- [ ] **Step 4: Implement** `createTerminalClient` (pure, reuses `bytesToBase64`/`base64ToBytes` from `@launchkit/pty`). The `useTerminals` hook wraps it with React state (the set of open tabs) + the Electrobun message wiring (subscribe to inbound `messages` via the Electroview, send via the Electroview). Keep the Electroview coupling in one thin spot (mirror `ipc-client.ts`).
- [ ] **Step 5: Run** — Expected: PASS.
- [ ] **Step 6: Commit** `git add apps/desktop/package.json apps/desktop/views/main/terminal bun.lock && git commit -m "feat(desktop): xterm deps + terminal message client/hook [terminal-12]"`

### Task 13: Terminal page (tab strip + xterm pane) + route

**Files:**
- Create: `apps/desktop/views/main/terminal/TerminalPage.tsx`, `TerminalPane.tsx`, `TabStrip.tsx`
- Modify: `apps/desktop/views/main/app.tsx` (add `terminal` route + nav item), `apps/desktop/views/main/pages/*` (Dashboard/tray launch navigates to terminal), `apps/desktop/views/main/app.css` (terminal/tab styling)

- [ ] **Step 1:** Add `"terminal"` to `ROUTES`/`NAV_ITEMS`/`PAGES` in `app.tsx` (nav label "Terminal").
- [ ] **Step 2:** Implement `TabStrip` (renders one tab per open session id from `useTerminals`, active highlight, close button → `kill(id)` + remove tab) and `TerminalPane` (mounts an `xterm.js` `Terminal` + `FitAddon` into a div ref; on mount `attach(id)`, write incoming `pty-data` bytes to the xterm, `term.onData` → `sendInput`, `FitAddon` + a `ResizeObserver` → `sendResize`; theme pulled from CSS variables to match `app.css`). Keep xterm instances per session in the hook so switching tabs/navigating preserves them.
- [ ] **Step 3:** `TerminalPage` composes `TabStrip` + the active `TerminalPane`. When `launchHarness` returns `{ sessionId }` (Dashboard quick-launch), register the tab in `useTerminals` and navigate to `#terminal`.
- [ ] **Step 4:** Add CSS for the tab strip + terminal container in `app.css` (full-height pane, tab row, active state) — consistent with the existing theme.
- [ ] **Step 5:** Run the gate `bun run typecheck && bun run lint && bun test`. Expected: green (component render tested where practical with a fake client; xterm DOM is thin).
- [ ] **Step 6: Commit** `git add apps/desktop/views/main && git commit -m "feat(desktop): embedded terminal page with tabs + xterm pane [terminal-13]"`

---

## Phase 5 — build, verify, document

### Task 14: Rebuild, manual verification, ledger

**Files:**
- Modify: `apps/desktop/MANUAL-VERIFICATION.md`, `build-plan/PROGRESS.md`

- [ ] **Step 1:** Full gate: `bun run typecheck && bun run lint && bun test`. Expected: all green.
- [ ] **Step 2:** `cd apps/desktop && bunx electrobun build`. Confirm it bundles (xterm included; check `build/.../app/views/main/app.js` grew and any xterm CSS is bundled/imported). Run `bash apps/desktop/scripts/smoke.sh` — Expected: PASS.
- [ ] **Step 3:** Manual eyes-on (the parts automated tests can't cover): launch the app → click **Launch Claude Code** → confirm a Terminal tab opens with the Claude TUI rendered and interactive (type, see responses), resize the window (TUI reflows), launch a second harness (second tab, both run), close a tab (harness terminates, Sessions shows it closed with an exit code). Record results in `MANUAL-VERIFICATION.md` (add a Terminal section + check boxes).
- [ ] **Step 4:** Add a dated "Embedded terminal" section to `build-plan/PROGRESS.md` (the new `@launchkit/pty` package, FFI pty, Electrobun messages transport, webview xterm UI, GUI-launch rewiring) with commit SHAs.
- [ ] **Step 5: Commit** `git add apps/desktop/MANUAL-VERIFICATION.md build-plan/PROGRESS.md && git commit -m "docs: record embedded terminal + manual verification [terminal-14]"`

---

## Self-review notes

- **Spec coverage:** package `@launchkit/pty` (Tasks 0–7); FFI pty proven feasible (Task 7 mirrors the spike); transport over Electrobun `messages` (Tasks 4,10,12); manager/registry/scrollback/exit→SessionStore.close (Tasks 2,3,5); GUI-launch rewiring + CLI untouched (Tasks 8,11); webview Terminal route + tabs + xterm + attach/scrollback (Tasks 12,13); lifecycle/close-tab-kills + error tab (Tasks 5,11,13); testing strategy (unit fakes + FFI integration + manual) throughout.
- **Type consistency:** `SessionId` (from `@launchkit/types`) keys the registry, manager, and protocol everywhere. `PtyHandle`/`PtyAdapter`/`PtyOpenOptions`/`PtyError` defined in Task 1, used in 5/7/9. `PtyInbound`/`PtyOutbound` defined once (Task 4) and routed in 5/10/12. `TerminalManager.launch/handleInbound/bindSend` consistent across 5/9/10/11. `resolveHarnessLaunch` defined in Task 8, used in Task 11.
- **Open risk flagged for the implementer:** the exact Electrobun `messages` handler registration + bun-side `rpc.send` shape must be confirmed against the installed `electrobun` (Task 10) and the seam adapted there only — all logic above it is tested with fakes. xterm CSS must be imported/bundled locally (no remote) to satisfy CSP.
- **Phasing:** Phases 1–2 deliver a tested pty engine; Phase 3 wires it; a single working terminal is reachable by end of Task 13, with multi-tab included. Task 11's tray-open-window detail and Task 13's navigation are the integration-heavy spots.
```
