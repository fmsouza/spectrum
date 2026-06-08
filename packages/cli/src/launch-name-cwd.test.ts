import { describe, expect, it } from "bun:test"
import type { LaunchParams } from "@launchkit/harnesses"
import type { SessionInput } from "@launchkit/sessions"
import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"
import type { CliDeps } from "./deps"
import { runCli } from "./run"
import { makeFakeDeps } from "./test-support"

const claude: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  builtIn: true,
}

describe("launch --name / --cwd", () => {
  it("threads --name and --cwd into deps.sessions.create and --cwd into deps.launch", async () => {
    const launchCalls: LaunchParams[] = []
    const createInputs: SessionInput[] = []
    const base = makeFakeDeps({
      harnesses: [claude],
      launchSpy: (p) => launchCalls.push(p),
    })
    // Wrap the real in-memory session store so we can assert the exact create() input.
    const deps: CliDeps = {
      ...base,
      sessions: {
        ...base.sessions,
        create: (input: SessionInput) => {
          createInputs.push(input)
          return base.sessions.create(input)
        },
      },
    }

    const result = await runCli(deps)([
      "launch",
      "claude",
      "--name",
      "My run",
      "--cwd",
      "/Users/fred/projects/app",
    ])

    expect(result).toEqual({ ok: true, value: undefined })

    // --cwd reaches the launcher (which sets the child process cwd).
    expect(launchCalls[0]?.cwd).toBe("/Users/fred/projects/app")

    // --name and --cwd reach the session record.
    expect(createInputs[0]?.name).toBe("My run")
    expect(createInputs[0]?.cwd).toBe("/Users/fred/projects/app")
  })

  it("omits name from the session input when --name flag is absent", async () => {
    const createInputs: SessionInput[] = []
    const base = makeFakeDeps({ harnesses: [claude] })
    const deps: CliDeps = {
      ...base,
      sessions: {
        ...base.sessions,
        create: (input: SessionInput) => {
          createInputs.push(input)
          return base.sessions.create(input)
        },
      },
    }

    const result = await runCli(deps)([
      "launch",
      "claude",
      "--cwd",
      "/Users/fred/projects/app",
    ])

    expect(result).toEqual({ ok: true, value: undefined })
    expect(createInputs[0]?.name).toBeUndefined()
    expect(createInputs[0]?.cwd).toBe("/Users/fred/projects/app")
  })
})
