import { describe, expect, it } from "bun:test"
import type { Profile } from "@launchkit/types"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { useProfiles } from "./useProfiles"

const profile: Profile = {
  id: "pr_1" as Profile["id"],
  name: "Work",
  harnessId: "claude" as Profile["harnessId"],
  alias: "fast" as Profile["alias"],
  env: {},
}

const Probe = (): JSX.Element => {
  const { data, add } = useProfiles()
  return (
    <div>
      <span>{data === undefined ? "no-data" : `count:${data.length}`}</span>
      <button
        type="button"
        onClick={() =>
          void add({
            name: "New",
            harnessId: "claude" as Profile["harnessId"],
            alias: "fast" as Profile["alias"],
            env: {},
          })
        }
      >
        add
      </button>
    </div>
  )
}

describe("useProfiles", () => {
  it("loads profiles via getProfiles", async () => {
    const client = createFakeIpcClient({
      getProfiles: async () => ({ ok: true, value: [profile] }),
    })
    render(
      <IpcClientProvider client={client}>
        <Probe />
      </IpcClientProvider>,
    )
    await waitFor(() => expect(screen.getByText("count:1")).toBeInTheDocument())
  })

  it("calls addProfile then refetches when add is invoked", async () => {
    const client = createFakeIpcClient({
      getProfiles: async () => ({ ok: true, value: [] }),
      addProfile: async () => ({ ok: true, value: profile }),
    })
    render(
      <IpcClientProvider client={client}>
        <Probe />
      </IpcClientProvider>,
    )
    await waitFor(() => expect(screen.getByText("count:0")).toBeInTheDocument())
    fireEvent.click(screen.getByText("add"))
    await waitFor(() => expect(client.calls.addProfile.length).toBe(1))
    expect(client.calls.getProfiles.length).toBeGreaterThanOrEqual(2)
  })
})
