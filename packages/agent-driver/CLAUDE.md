# @launchkit/agent-driver

**Responsibility:** the per-harness `AgentDriver`/`AgentSession` seam, the run-event socket protocol
(`RunnerInbound`/`RunnerOutbound` + `decodeRunnerInbound`), the `RunManager` (structural twin of
`TerminalManager`: persist-then-forward fan-out + inbound routing + attach replay), and the `FakeDriver`
(+ `demoScript`) that powers every test and the dev "demo" harness.

**Public API (barrel `src/index.ts`):** `AgentDriver`/`AgentSession`/`AgentStartInput`/`DriverError`;
`SessionSink`/`RunEventSink` ports; `RunnerInbound`/`RunnerOutbound`/`decodeRunnerInbound`;
`RunManager`/`RunManagerDeps`/`RunLaunchInput`/`createRunManager`; `FakeReaction`/`FakeScript`/
`createFakeDriver`/`demoScript`. The socket protocol now includes the inbound command `run-set-mode`;
`AgentSession` has an optional `setMode` method for mid-session mode changes; `AgentStartInput` carries
an optional `permissionMode` field (absent means manual).

**Depends on:** `@launchkit/agent-events`, `@launchkit/types`, `@launchkit/utils`.

**Effect owned:** none — pure logic. The `RunManager` receives its `send` sink, `Clock`, `SessionSink`,
`RunEventSink`, and `AgentDriver` injected; `apps/desktop` constructs the real SessionStore + RunStore
(which structurally satisfy the ports) and the loopback socket.

**Local rules:** ports `SessionSink`/`RunEventSink` are defined LOCALLY here so this package imports
neither `@launchkit/sessions` nor `@launchkit/run-store` (no dependency cycle). `AgentSession.onEvent`
is SINGLE-SUBSCRIBER (PtyHandle convention) — register once, fan out inside the one callback. All
inbound socket messages are zod-validated (`decodeRunnerInbound`). Event type strings are kebab
(`tool-call-started`); inbound command strings are `run-*`.
