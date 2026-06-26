import { describe, expect, it } from "bun:test"
import { renderHook, waitFor } from "@testing-library/react"
import { isWakeGap, useConnectionWatch } from "./useConnectionWatch"

describe("isWakeGap", () => {
  it("is true when the elapsed wall-clock since the last tick exceeds the gap", () => {
    expect(isWakeGap(1_000, 1_000 + 20_000, 10_000)).toBe(true)
  })
  it("is false for a normal tick interval", () => {
    expect(isWakeGap(1_000, 1_000 + 2_000, 10_000)).toBe(false)
  })
  it("is false when the elapsed time exactly equals the gap", () => {
    expect(isWakeGap(1_000, 1_000 + 10_000, 10_000)).toBe(false)
  })
})

describe("useConnectionWatch", () => {
  it("calls onLost when a wake gap is followed by a failed ping", async () => {
    let t = 0
    const now = (): number => t
    let onLostCalls = 0
    renderHook(() =>
      useConnectionWatch({
        ping: () => Promise.resolve(false), // backend unreachable
        onLost: () => {
          onLostCalls += 1
        },
        now,
        tickMs: 5, // fast ticks for the test
        gapMs: 100,
      }),
    )
    // Simulate a sleep: jump wall-clock far ahead so the next tick sees a gap.
    t = 10_000
    await waitFor(() => expect(onLostCalls).toBeGreaterThan(0))
  })
  it("does NOT call onLost when the ping succeeds after a wake gap", async () => {
    let t = 0
    const now = (): number => t
    let onLostCalls = 0
    renderHook(() =>
      useConnectionWatch({
        ping: () => Promise.resolve(true), // backend healthy
        onLost: () => {
          onLostCalls += 1
        },
        now,
        tickMs: 5, // fast ticks for the test
        gapMs: 100,
      }),
    )
    // Simulate a sleep: jump wall-clock far ahead so the next tick sees a gap.
    t = 10_000
    // Wait briefly for any ticks and ping to resolve, then assert onLost was NOT called.
    await new Promise((r) => setTimeout(r, 50))
    expect(onLostCalls).toBe(0)
  })

  // Reproduces the stuck "reconnecting" overlay: after a wake gap + failed ping
  // latches `lost` true, a subsequent reconnection (ping succeeds) must clear it.
  // Without a recovery path the overlay stays forever even though the backend is
  // healthy again — the exact symptom the user reports.
  it("clears lost when a later ping succeeds after the connection recovers", async () => {
    let t = 0
    const now = (): number => t
    let onLostCalls = 0
    // Backend starts unreachable, then recovers.
    let backendOk = false
    // Captured on each render so we can assert against the latest `lost` value
    // without reassigning inside the render callback (biome forbids that pattern).
    const captured: { lost: boolean } = { lost: false }
    const { rerender } = renderHook(() => {
      const r = useConnectionWatch({
        ping: () => Promise.resolve(backendOk),
        onLost: () => {
          onLostCalls += 1
        },
        now,
        tickMs: 5,
        gapMs: 100,
      })
      captured.lost = r.lost
      return r
    })
    // First sleep: backend still down → latch lost=true, fire onLost.
    t = 10_000
    await waitFor(() => expect(onLostCalls).toBeGreaterThan(0))
    await waitFor(() => expect(captured.lost).toBe(true))

    // Backend recovers. Second sleep gap triggers another ping, which now succeeds.
    backendOk = true
    t = 20_000
    // Keep the hook live across the simulated gap.
    rerender(captured)
    await waitFor(() => expect(captured.lost).toBe(false))
  })
})
