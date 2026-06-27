# @spectrum/pty

Terminal/PTY lifecycle for the in-app terminal panel.

## Responsibility
Owns the `TerminalManager` (a registry of live PTYs keyed by `(sessionId, tabId)`), the pure `TerminalInbound`/`TerminalOutbound` wire protocol, and the `PtySpawner`/`PtyHandle` SPI. The bun-side `apps/desktop/src/gui/terminal-socket.ts` wires `TerminalManager` to a loopback WebSocket (twin of `@spectrum/agent-driver` + `runner-socket.ts`).

## Public API
- `createTerminalManager(deps)` → `TerminalManager` (`launch`, `handleInbound`, `bindSend`, `dispose`)
- `decodeTerminalInbound` (zod-validated inbound frame decoder)
- `TerminalInbound`, `TerminalOutbound`, `TerminalError`, `TerminalSession` types
- `createNodePtySpawner()`, `createFakePtySpawner()`

## Local invariants
- Effects (spawn) only through the injected `PtySpawner`; never call `node-pty` directly outside `createNodePtySpawner`.
- `launch` returns `Result<TerminalSession, TerminalError>`; never throws.
- PTY bytes are NEVER logged (may contain secrets). Only lifecycle/boundary events are logged.
- `command` is always `process.env.SHELL` (default `/bin/zsh`); `args` is always `["-l"]` (fixed, arg-array discipline).
