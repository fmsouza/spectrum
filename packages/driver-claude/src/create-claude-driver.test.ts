import { describe, expect, it } from "bun:test"
import type { CanonicalEvent } from "@launchkit/agent-events"
import { createSequentialIdGen } from "@launchkit/utils"
import { createClaudeDriver } from "./create-claude-driver"
import type { ClaudeQuery, ClaudeSdk } from "./sdk-glue"

const sdkYielding = (msgs: readonly unknown[]): ClaudeSdk => ({
  query: ({ prompt }) => {
    void (async () => {
      for await (const _ of prompt) {
        // drain
      }
    })()
    const it = (async function* () {
      for (const m of msgs) yield m
    })()
    return Object.assign(it, {
      interrupt: async () => undefined,
      close: () => undefined,
      setPermissionMode: async () => undefined,
    }) as ClaudeQuery
  },
})

describe("createClaudeDriver", () => {
  it("starts and streams mapped canonical events from the (fake) SDK", async () => {
    const driver = createClaudeDriver({
      idGen: createSequentialIdGen(),
      loadSdk: async () =>
        sdkYielding([
          { type: "system", subtype: "init", model: "claude-x" },
          {
            type: "result",
            subtype: "success",
            is_error: false,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        ]),
      scheduler: (fn) => fn(),
    })
    const started = driver.start({
      harnessId: "claude" as never,
      cwd: "/x",
      env: {},
    })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const seen: CanonicalEvent[] = []
    started.value.onEvent((e) => seen.push(e))
    await new Promise((r) => setTimeout(r, 20))
    expect(seen[0]).toMatchObject({ type: "runner-started", model: "claude-x" })
    expect(seen.at(-1)).toMatchObject({
      type: "runner-finished",
      status: "completed",
    })
  })
})
