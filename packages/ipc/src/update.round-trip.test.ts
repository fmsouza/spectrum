import { describe, expect, it } from "bun:test"
import { IpcMethodSchemas } from "./methods"

const sampleState = {
  phase: "available",
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  available: true,
  progress: 0,
  error: null,
  channel: "stable",
  showBanner: true,
}

describe("update IPC schemas", () => {
  it("validates a full UpdateState result for getUpdateState", () => {
    const parsed = IpcMethodSchemas.getUpdateState.result.parse(sampleState)
    expect(parsed.phase).toBe("available")
    expect(parsed.showBanner).toBe(true)
  })

  it("rejects an unknown phase", () => {
    expect(
      IpcMethodSchemas.getUpdateState.result.safeParse({
        ...sampleState,
        phase: "bogus",
      }).success,
    ).toBe(false)
  })

  it("validates setUpdateChannel params", () => {
    expect(
      IpcMethodSchemas.setUpdateChannel.params.parse({ channel: "canary" }),
    ).toEqual({ channel: "canary" })
    expect(
      IpcMethodSchemas.setUpdateChannel.params.safeParse({ channel: "beta" })
        .success,
    ).toBe(false)
  })

  it("validates dismissUpdate params", () => {
    expect(
      IpcMethodSchemas.dismissUpdate.params.parse({ version: "1.1.0" }),
    ).toEqual({ version: "1.1.0" })
  })

  it("encodes void results as null for download/apply", () => {
    expect(IpcMethodSchemas.startUpdateDownload.result.parse(null)).toBeNull()
    expect(IpcMethodSchemas.applyUpdate.result.parse(null)).toBeNull()
  })
})
