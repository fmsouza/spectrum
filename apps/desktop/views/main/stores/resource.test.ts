import { describe, expect, it, mock } from "bun:test"
import type { IpcError } from "@launchkit/ipc"
import type { Result } from "@launchkit/utils"
import { createResource } from "./resource"

type Bag = {
  data: number | undefined
  loading: boolean
  error: IpcError | undefined
}

/** Drive createResource with a plain mutable object standing in for a store. */
const harness = (call: () => Promise<Result<number, IpcError>>) => {
  const bag: Bag = { data: undefined, loading: false, error: undefined }
  const res = createResource<number>(
    call,
    (patch) => Object.assign(bag, patch),
    () => bag.data,
  )
  return { bag, res }
}

describe("createResource", () => {
  it("populates data and clears loading when the call resolves Ok", async () => {
    const { bag, res } = harness(async () => ({ ok: true, value: 42 }))
    await res.fetch()
    expect(bag.data).toBe(42)
    expect(bag.loading).toBe(false)
    expect(bag.error).toBeUndefined()
  })

  it("sets the error and leaves data undefined when the call resolves Err", async () => {
    const { bag, res } = harness(async () => ({
      ok: false,
      error: { kind: "transport-failed", detail: "down" },
    }))
    await res.fetch()
    expect(bag.data).toBeUndefined()
    expect(bag.error?.kind).toBe("transport-failed")
    expect(bag.loading).toBe(false)
  })

  it("dedupes concurrent fetch calls into one IPC request", async () => {
    const call = mock(async () => ({ ok: true as const, value: 1 }))
    const { res } = harness(call)
    await Promise.all([res.fetch(), res.fetch()])
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("does not refetch when data is already loaded (fetch-if-needed)", async () => {
    const call = mock(async () => ({ ok: true as const, value: 1 }))
    const { res } = harness(call)
    await res.fetch()
    await res.fetch()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("forces a refetch via invalidate even when data is present", async () => {
    const call = mock(async () => ({ ok: true as const, value: 1 }))
    const { res } = harness(call)
    await res.fetch()
    await res.invalidate()
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("sets loading to true while the call is in flight", async () => {
    let resolveCall!: (v: Result<number, IpcError>) => void
    const call = (): Promise<Result<number, IpcError>> =>
      new Promise((r) => {
        resolveCall = r
      })
    const { bag, res } = harness(call)
    const p = res.fetch()
    expect(bag.loading).toBe(true)
    resolveCall({ ok: true, value: 7 })
    await p
    expect(bag.loading).toBe(false)
  })

  it("invalidate supersedes an in-flight fetch instead of joining it", async () => {
    let calls = 0
    const call = async (): Promise<Result<number, IpcError>> => {
      calls += 1
      const n = calls
      return { ok: true, value: n }
    }
    const { bag, res } = harness(call)
    const inflight = res.fetch() // call #1 in flight (value 1)
    await res.invalidate() // must start a fresh call #2 (value 2), not join #1
    await inflight
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(bag.data).toBe(2)
  })
})
