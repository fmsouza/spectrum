import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test"
import { act, renderHook } from "@testing-library/react"
import { useElapsedSeconds } from "./useElapsedSeconds"

describe("useElapsedSeconds", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("is undefined until the visible threshold, then ticks in whole seconds", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedSeconds(active),
      {
        initialProps: { active: true },
      },
    )
    expect(result.current).toBeUndefined()
    act(() => {
      jest.advanceTimersByTime(4000)
    })
    expect(result.current).toBe(4)
    rerender({ active: false })
    expect(result.current).toBeUndefined()
  })
})
