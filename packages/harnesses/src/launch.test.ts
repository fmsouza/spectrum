import { describe, expect, it } from "bun:test"
import {
  AliasNameSchema,
  type HarnessDefinition,
  HarnessIdSchema,
} from "@launchkit/types"
import { createFakeCommandResolver } from "./command-resolver"
import { launchHarness, resolveHarnessLaunch } from "./launch"
import { createRecordingProcessSpawner } from "./process-spawner"

const harness: HarnessDefinition = {
  id: HarnessIdSchema.parse("claude"),
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: {
    ANTHROPIC_BASE_URL: "{{proxyUrl}}",
    ANTHROPIC_API_KEY: "{{proxyKey}}",
    ANTHROPIC_MODEL: "{{model}}",
  },
  defaultAlias: AliasNameSchema.parse("default"),
  builtIn: true,
}

const params = {
  harness,
  proxyUrl: "http://127.0.0.1:4000",
  proxyKey: "k-secret",
  model: AliasNameSchema.parse("default"),
}

describe("launchHarness", () => {
  it("spawns the resolved absolute command with an empty args array and rendered env", () => {
    const resolver = createFakeCommandResolver({
      claude: "/usr/local/bin/claude",
    })
    const spawner = createRecordingProcessSpawner(999)

    const r = launchHarness({ resolver, spawner })(params)

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.pid).toBe(999)
    expect(spawner.calls).toHaveLength(1)
    const call = spawner.calls[0]
    expect(call?.command).toBe("/usr/local/bin/claude")
    expect(Array.isArray(call?.args)).toBe(true)
    expect(call?.args).toEqual([])
    expect(call?.env).toEqual({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
      ANTHROPIC_API_KEY: "k-secret",
      ANTHROPIC_MODEL: "default",
    })
  })

  it("surfaces the spawner's exited promise so callers can foreground the harness", async () => {
    const resolver = createFakeCommandResolver({
      claude: "/usr/local/bin/claude",
    })
    const spawner = createRecordingProcessSpawner(999, 42)

    const r = launchHarness({ resolver, spawner })(params)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await r.value.exited).toBe(42)
  })

  it("returns an invalid-command error and never spawns when the command is relative", () => {
    const resolver = createFakeCommandResolver({})
    const spawner = createRecordingProcessSpawner(1)
    const relative: HarnessDefinition = { ...harness, command: "./claude" }

    const r = launchHarness({ resolver, spawner })({
      ...params,
      harness: relative,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-command")
    expect(spawner.calls).toEqual([])
  })

  it("resolves the command and renders the env without spawning", () => {
    const resolver = createFakeCommandResolver({
      claude: "/usr/local/bin/claude",
    })

    const r = resolveHarnessLaunch({ resolver })(params)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.command).toBe("/usr/local/bin/claude")
    expect(r.value.args).toEqual([])
    expect(r.value.env).toEqual({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
      ANTHROPIC_API_KEY: "k-secret",
      ANTHROPIC_MODEL: "default",
    })
  })

  it("returns an invalid-template error and never spawns when an env token is unknown", () => {
    const resolver = createFakeCommandResolver({
      claude: "/usr/local/bin/claude",
    })
    const spawner = createRecordingProcessSpawner(1)
    const leaky: HarnessDefinition = {
      ...harness,
      envTemplate: { ANTHROPIC_API_KEY: "{{secret}}" },
    }

    const r = launchHarness({ resolver, spawner })({
      ...params,
      harness: leaky,
    })

    expect(r).toEqual({
      ok: false,
      error: { kind: "invalid-template", token: "secret" },
    })
    expect(spawner.calls).toEqual([])
  })

  it("merges params.env on top of the rendered template env (params.env wins)", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    const r = resolveHarnessLaunch({ resolver })({
      ...params,
      env: { ANTHROPIC_MODEL: "override-model", EXTRA: "1" },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.env.ANTHROPIC_MODEL).toBe("override-model") // params.env wins
    expect(r.value.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:4000") // template kept
    expect(r.value.env.EXTRA).toBe("1") // extra key added
  })

  it("passes cwd through to the spawner on launch", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    const spawner = createRecordingProcessSpawner(5)
    const r = launchHarness({ resolver, spawner })({ ...params, cwd: "/work/dir" })
    expect(r.ok).toBe(true)
    expect(spawner.calls[0]?.cwd).toBe("/work/dir")
  })

  it("spawns with the merged env when params.env is given", () => {
    const resolver = createFakeCommandResolver({ claude: "/usr/local/bin/claude" })
    const spawner = createRecordingProcessSpawner(5)
    launchHarness({ resolver, spawner })({ ...params, env: { EXTRA: "yes" } })
    expect(spawner.calls[0]?.env.EXTRA).toBe("yes")
  })
})
