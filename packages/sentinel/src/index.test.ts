import { describe, expect, it } from "bun:test"
import { ping } from "./index"

describe("ping", () => {
  it("returns 'pong' when called", () => {
    expect(ping()).toBe("pong")
  })
})
