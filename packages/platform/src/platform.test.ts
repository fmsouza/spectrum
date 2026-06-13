import { describe, expect, it } from "bun:test"
import { detectPlatform } from "./platform"

describe("detectPlatform", () => {
  it("maps darwin to macos when given the node platform", () => {
    expect(detectPlatform("darwin")).toBe("macos")
  })
  it("maps linux to linux when given the node platform", () => {
    expect(detectPlatform("linux")).toBe("linux")
  })
  it("maps win32 to windows when given the node platform", () => {
    expect(detectPlatform("win32")).toBe("windows")
  })
  it("maps an unrecognized platform to unknown when given e.g. freebsd", () => {
    expect(detectPlatform("freebsd" as NodeJS.Platform)).toBe("unknown")
  })
})
