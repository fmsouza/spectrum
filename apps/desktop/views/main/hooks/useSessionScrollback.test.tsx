import { describe, expect, it } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import { bytesToBase64 } from "@launchkit/pty"
import type { SessionId } from "@launchkit/types"
import { IpcClientProvider } from "../IpcClientContext"
import { createFakeIpcClient } from "../test/fake-client"
import { useSessionScrollback } from "./useSessionScrollback"

const Probe = ({ id }: { readonly id: SessionId }): JSX.Element => {
  const { data } = useSessionScrollback(id)
  return <span>{data === undefined ? "no-data" : `len:${data.length}`}</span>
}

describe("useSessionScrollback", () => {
  it("fetches and base64-decodes bytesBase64 for replay", async () => {
    const bytes = new Uint8Array([0, 9, 200, 255])
    const client = createFakeIpcClient({
      getSessionScrollback: async () => ({
        ok: true,
        value: { bytesBase64: bytesToBase64(bytes) },
      }),
    })
    const { getByText } = render(
      <IpcClientProvider client={client}>
        <Probe id={"s_1" as SessionId} />
      </IpcClientProvider>,
    )
    await waitFor(() => expect(getByText("len:4")).toBeInTheDocument())
    expect(client.calls.getSessionScrollback[0]).toEqual({ id: "s_1" })
  })
})
