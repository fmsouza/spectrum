import { describe, expect, it } from "bun:test"
import type { Profile, ProfileId } from "@launchkit/types"
import { createIpcClient } from "./client"
import { createMemoryTransportPair } from "./fake-transport"
import type { IpcHandlers } from "./server"
import { createIpcServer } from "./server"

const sampleProfile: Profile = {
  id: "prof_default" as ProfileId,
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("getProfiles round-trip", () => {
  it("returns the profile list through the memory transport pair", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "getProfiles"> = {
      getProfiles: async () => [sampleProfile],
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.getProfiles(undefined)
    expect(r).toEqual({ ok: true, value: [sampleProfile] })
  })
})

describe("addProfile round-trip", () => {
  it("sends an id-less input and returns the minted profile", async () => {
    const pair = createMemoryTransportPair()
    const handlers: Pick<IpcHandlers, "addProfile"> = {
      addProfile: async (input) => ({
        ...input,
        id: "prof_minted" as ProfileId,
      }),
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.addProfile({
      name: "Default",
      harnessId: "claude" as Profile["harnessId"],
      alias: "default" as Profile["alias"],
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
    expect(r).toEqual({
      ok: true,
      value: {
        id: "prof_minted" as ProfileId,
        name: "Default",
        harnessId: "claude" as Profile["harnessId"],
        alias: "default" as Profile["alias"],
        env: { ANTHROPIC_MODEL: "sonnet" },
      },
    })
  })
})

describe("updateProfile round-trip", () => {
  it("sends a full profile and returns the updated profile", async () => {
    const pair = createMemoryTransportPair()
    const updated: Profile = { ...sampleProfile, name: "Renamed" }
    const handlers: Pick<IpcHandlers, "updateProfile"> = {
      updateProfile: async () => updated,
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.updateProfile(sampleProfile)
    expect(r).toEqual({ ok: true, value: updated })
  })
})

describe("deleteProfile round-trip", () => {
  it("sends the id and returns Ok(null)", async () => {
    const pair = createMemoryTransportPair()
    let deletedId: string | undefined
    const handlers: Pick<IpcHandlers, "deleteProfile"> = {
      deleteProfile: async (params) => {
        deletedId = params.id
        return null
      },
    }
    createIpcServer(handlers as IpcHandlers, pair.server)
    const client = createIpcClient(pair.client)
    const r = await client.deleteProfile({ id: "prof_default" as ProfileId })
    expect(r).toEqual({ ok: true, value: null })
    expect(deletedId).toBe("prof_default")
  })
})
