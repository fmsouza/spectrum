import { describe, expect, it } from "bun:test"
import type { IpcClient } from "@spectrum/ipc"
import { ok } from "@spectrum/utils"
import { createUpdateStore } from "./updateStore"

const available = {
  phase: "available" as const,
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  available: true,
  progress: 0,
  error: null,
  channel: "stable" as const,
  showBanner: true,
}

const fakeClient = (over: Partial<IpcClient> = {}): IpcClient =>
  ({
    checkForUpdate: async () => ok(available),
    getUpdateState: async () => ok(available),
    startUpdateDownload: async () => ok(null),
    applyUpdate: async () => ok(null),
    dismissUpdate: async () => ok(null),
    setUpdateChannel: async () => ok({ ...available, channel: "canary" }),
    ...over,
  }) as unknown as IpcClient

describe("createUpdateStore", () => {
  it("check populates the state", async () => {
    const store = createUpdateStore({ client: fakeClient() })
    await store.getState().check()
    expect(store.getState().state?.showBanner).toBe(true)
    expect(store.getState().state?.latestVersion).toBe("1.1.0")
  })

  it("dismiss calls the client with the latest version and re-reads state", async () => {
    let dismissedWith: string | null = null
    const store = createUpdateStore({
      client: fakeClient({
        dismissUpdate: async ({ version }) => {
          dismissedWith = version
          return ok(null)
        },
        getUpdateState: async () => ok({ ...available, showBanner: false }),
      }),
    })
    await store.getState().check()
    await store.getState().dismiss()
    expect(dismissedWith).toBe("1.1.0")
    expect(store.getState().state?.showBanner).toBe(false)
  })

  it("download starts the download then refreshes", async () => {
    let started = false
    const store = createUpdateStore({
      client: fakeClient({
        startUpdateDownload: async () => {
          started = true
          return ok(null)
        },
        getUpdateState: async () =>
          ok({ ...available, phase: "downloading", progress: 0.3 }),
      }),
    })
    await store.getState().check()
    await store.getState().download()
    expect(started).toBe(true)
    expect(store.getState().state?.phase).toBe("downloading")
  })

  it("setChannel forwards the channel and stores the returned state", async () => {
    const store = createUpdateStore({ client: fakeClient() })
    await store.getState().setChannel("canary")
    expect(store.getState().state?.channel).toBe("canary")
  })
})
