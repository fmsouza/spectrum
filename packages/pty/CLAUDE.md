# @launchkit/pty

**Responsibility:** embedded-terminal engine — allocate a real PTY for a launched harness, stream its
bytes to/from the GUI webview, and track per-session scrollback + exit state.

**Public API (barrel `src/index.ts`):** `PtyAdapter`/`PtyHandle`/`PtyOpenOptions`/`PtyError` + `createFakePty`;
`createScrollback`; `createTerminalRegistry`; the message protocol (`PtyInbound`/`PtyOutbound`,
`encodeData`/`encodeExit`/`decodeInbound`, `bytesToBase64`/`base64ToBytes`); `createTerminalManager`
(+ `TerminalManager`/`TerminalManagerDeps`/`SessionSink`/`TerminalLaunchInput`); and `createFfiPty`
(the real macOS adapter).

**Depends on:** `@launchkit/types`, `@launchkit/utils`, `@launchkit/sessions`.

**Effect owned:** the pseudo-terminal — `createFfiPty` uses `bun:ffi` (`openpty` from `libutil` +
`Bun.spawn` on the slave fd). macOS-only; kept behind the `PtyAdapter` interface so all logic
(manager/registry/protocol) is unit-tested with `createFakePty`. The real adapter has an integration test.

**Local rules:** stream, never buffer beyond the bounded scrollback ring buffer. `PtyHandle.onData`/`onExit`
are SINGLE-SUBSCRIBER (a second registration overwrites the first) — register each once and fan out inside
the one callback. Terminal byte payloads cross the Electrobun `messages` channel base64-encoded
(`bytesToBase64`) so arbitrary bytes survive JSON. All inbound messages are zod-validated (`decodeInbound`).
