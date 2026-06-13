import { describe, expect, it } from "bun:test"
import { type Result, err, ok } from "@spectrum/utils"
import type { SecretError } from "./backend"
import type { ProcessRunner } from "./process-runner"
import { isSecretServiceAvailable } from "./secret-service-probe"

const runnerReturning = (
  result: Result<{ stdout: string }, SecretError>,
): ProcessRunner => ({
  run: async () => result,
})
const throwingRunner: ProcessRunner = {
  run: async () => {
    throw new Error("runner should not be called")
  },
}

describe("isSecretServiceAvailable", () => {
  it("returns false without running anything when secret-tool is not installed", async () => {
    const available = await isSecretServiceAvailable({
      runner: throwingRunner,
      commandExists: () => false,
    })
    expect(available).toBe(false)
  })

  it("returns true when the probe lookup merely reports a missing item (empty stderr)", async () => {
    const available = await isSecretServiceAvailable({
      runner: runnerReturning(
        err({ kind: "backend-failed", detail: "exit 1: " }),
      ),
      commandExists: () => true,
    })
    expect(available).toBe(true)
  })

  it("returns false when the probe fails with a D-Bus connection error", async () => {
    const available = await isSecretServiceAvailable({
      runner: runnerReturning(
        err({
          kind: "backend-failed",
          detail: "Cannot autolaunch D-Bus without X11 $DISPLAY",
        }),
      ),
      commandExists: () => true,
    })
    expect(available).toBe(false)
  })

  it("returns true when the probe lookup unexpectedly succeeds", async () => {
    const available = await isSecretServiceAvailable({
      runner: runnerReturning(ok({ stdout: "" })),
      commandExists: () => true,
    })
    expect(available).toBe(true)
  })

  it("returns a boolean (and never throws) when commandExists is omitted", async () => {
    const available = await isSecretServiceAvailable({ runner: throwingRunner })
    expect(typeof available).toBe("boolean")
  })
})
