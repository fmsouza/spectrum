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
})
