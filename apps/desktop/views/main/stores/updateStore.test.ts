import { describe, expect, it } from "bun:test"
import type { IpcClient } from "@spectrum/ipc"
import { err, ok } from "@spectrum/utils"
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
    const store = createUpdateStore({ client: fakeClient(), notify: () => {} })
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
      notify: () => {},
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
      notify: () => {},
    })
    await store.getState().check()
    await store.getState().download()
    expect(started).toBe(true)
    expect(store.getState().state?.phase).toBe("downloading")
  })

  it("setChannel forwards the channel and stores the returned state", async () => {
    const store = createUpdateStore({ client: fakeClient(), notify: () => {} })
    await store.getState().setChannel("canary")
    expect(store.getState().state?.channel).toBe("canary")
  })

  it("dismiss does NOT call dismissUpdate when there is no state yet", async () => {
    let dismissCalled = false
    const store = createUpdateStore({
      client: fakeClient({
        dismissUpdate: async () => {
          dismissCalled = true
          return ok(null)
        },
      }),
      notify: () => {},
    })
    await store.getState().dismiss()
    expect(dismissCalled).toBe(false)
  })

  it("notifies an error when the update check fails", async () => {
    const messages: string[] = []
    const store = createUpdateStore({
      client: fakeClient({
        checkForUpdate: async () =>
          err({ kind: "handler-failed", detail: "x" }),
      }),
      notify: (input) => {
        messages.push(input.message)
      },
    })
    await store.getState().check()
    expect(messages).toContain("Couldn't check for updates.")
    expect(store.getState().state).toBeUndefined()
  })

  it("notifies an error when switching channel fails", async () => {
    const messages: string[] = []
    const store = createUpdateStore({
      client: fakeClient({
        setUpdateChannel: async () =>
          err({ kind: "handler-failed", detail: "x" }),
      }),
      notify: (input) => {
        messages.push(input.message)
      },
    })
    await store.getState().setChannel("canary")
    expect(messages).toContain("Couldn't change the update channel.")
  })

  it("notifies an error when starting the download fails", async () => {
    const messages: string[] = []
    const store = createUpdateStore({
      client: fakeClient({
        startUpdateDownload: async () =>
          err({ kind: "handler-failed", detail: "x" }),
      }),
      notify: (input) => {
        messages.push(input.message)
      },
    })
    await store.getState().download()
    expect(messages).toContain("Couldn't start the update download.")
  })

  it("notifies an error when dismiss fails", async () => {
    const messages: string[] = []
    const store = createUpdateStore({
      client: fakeClient({
        dismissUpdate: async () => err({ kind: "handler-failed", detail: "x" }),
      }),
      notify: (input) => {
        messages.push(input.message)
      },
    })
    await store.getState().check()
    await store.getState().dismiss()
    expect(messages).toContain("Couldn't dismiss the update.")
  })

  it("notifies an error when applying the update fails", async () => {
    const messages: string[] = []
    const store = createUpdateStore({
      client: fakeClient({
        applyUpdate: async () => err({ kind: "handler-failed", detail: "x" }),
      }),
      notify: (input) => {
        messages.push(input.message)
      },
    })
    await store.getState().apply()
    expect(messages).toContain("Couldn't apply the update.")
  })
})
