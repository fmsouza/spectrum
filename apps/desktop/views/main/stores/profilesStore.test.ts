import { describe, expect, it, mock } from "bun:test"
import type { Profile } from "@launchkit/types"
import { createFakeIpcClient } from "../test/fake-client"
import { createProfilesStore } from "./profilesStore"

const profile = {
  id: "pr_1",
  name: "Work",
  harnessId: "claude",
  env: {},
} as unknown as Profile

describe("createProfilesStore", () => {
  it("loads profiles via fetch", async () => {
    const store = createProfilesStore({
      client: createFakeIpcClient({
        getProfiles: async () => ({ ok: true, value: [profile] }),
      }),
    })
    await store.getState().fetch()
    expect(store.getState().data).toEqual([profile])
  })

  it("add calls addProfile then invalidates", async () => {
    const getProfiles = mock(async () => ({
      ok: true as const,
      value: [profile],
    }))
    const client = createFakeIpcClient({
      getProfiles,
      addProfile: async () => ({ ok: true as const, value: profile }),
    })
    const store = createProfilesStore({ client })
    await store.getState().fetch()
    await store.getState().add({ name: "Work", harnessId: "claude", env: {} })
    expect(client.calls.addProfile.length).toBe(1)
    expect(getProfiles).toHaveBeenCalledTimes(2)
  })

  it("remove calls deleteProfile then invalidates", async () => {
    const getProfiles = mock(async () => ({
      ok: true as const,
      value: [profile],
    }))
    const client = createFakeIpcClient({
      getProfiles,
      deleteProfile: async () => ({ ok: true as const, value: null }),
    })
    const store = createProfilesStore({ client })
    await store.getState().fetch()
    await store.getState().remove("pr_1")
    expect(client.calls.deleteProfile[0]).toMatchObject({ id: "pr_1" })
    expect(getProfiles).toHaveBeenCalledTimes(2)
  })
})
