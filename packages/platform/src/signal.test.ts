import { describe, expect, it } from "bun:test"
import { defaultTerminationSignal } from "./signal"

describe("defaultTerminationSignal", () => {
  it("returns SIGTERM for graceful termination on posix", () => {
    expect(defaultTerminationSignal("linux")).toBe("SIGTERM")
    expect(defaultTerminationSignal("macos")).toBe("SIGTERM")
  })
  it("returns SIGKILL on windows where there is no graceful POSIX signal", () => {
    expect(defaultTerminationSignal("windows")).toBe("SIGKILL")
  })
})
