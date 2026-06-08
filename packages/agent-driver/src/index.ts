export const AGENT_DRIVER_PACKAGE = "@launchkit/agent-driver" as const
export type {
  AgentDriver,
  AgentSession,
  AgentStartInput,
  DriverError,
} from "./driver"
export type { FakeReaction, FakeScript } from "./fake-driver"
export { createFakeDriver, demoScript } from "./fake-driver"
export type { RunEventSink, SessionSink } from "./ports"
export type { RunnerInbound, RunnerOutbound } from "./protocol"
export { decodeRunnerInbound } from "./protocol"
export type { RunLaunchInput, RunManager, RunManagerDeps } from "./manager"
export { createRunManager } from "./manager"
