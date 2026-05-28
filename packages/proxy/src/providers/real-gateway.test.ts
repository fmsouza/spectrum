import { describe, expect, it } from "bun:test"
import { mapFullStreamPart } from "./real-gateway"

describe("mapFullStreamPart", () => {
  it("maps a v5 text-delta part to a text-delta event", () => {
    expect(mapFullStreamPart({ type: "text-delta", text: "hi" })).toEqual({
      type: "text-delta",
      text: "hi",
    })
  })

  it("maps a finish part to a finish event with stringified reason", () => {
    expect(mapFullStreamPart({ type: "finish", finishReason: "stop" })).toEqual(
      { type: "finish", finishReason: "stop" },
    )
  })

  it("maps an error part to an error event", () => {
    expect(
      mapFullStreamPart({ type: "error", error: new Error("boom") }),
    ).toEqual({ type: "error", detail: "Error: boom" })
  })

  it("returns undefined for unknown part types", () => {
    expect(mapFullStreamPart({ type: "text-start" })).toBeUndefined()
  })
})
