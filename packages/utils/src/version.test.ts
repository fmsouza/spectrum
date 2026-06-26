import { describe, expect, it } from "bun:test"
import { parseAppVersion } from "./version"

describe("parseAppVersion", () => {
  it("parses a canary version into base, channel, and build number", () => {
    expect(parseAppVersion("1.6.0-canary.43")).toEqual({
      base: "1.6.0",
      channel: "canary",
      build: 43,
      full: "1.6.0-canary.43",
    })
  })

  it("parses a multi-digit canary build number", () => {
    expect(parseAppVersion("1.6.0-canary.142")).toEqual({
      base: "1.6.0",
      channel: "canary",
      build: 142,
      full: "1.6.0-canary.142",
    })
  })

  it("parses a stable version with channel stable and null build", () => {
    expect(parseAppVersion("1.6.0")).toEqual({
      base: "1.6.0",
      channel: "stable",
      build: null,
      full: "1.6.0",
    })
  })

  it("falls back to development channel for an unrecognized string", () => {
    expect(parseAppVersion("1.4.0-dev")).toEqual({
      base: "1.4.0-dev",
      channel: "development",
      build: null,
      full: "1.4.0-dev",
    })
  })

  it("falls back to development channel for an empty string", () => {
    expect(parseAppVersion("")).toEqual({
      base: "",
      channel: "development",
      build: null,
      full: "",
    })
  })

  it("does not treat a canary tag with a non-numeric build as canary", () => {
    expect(parseAppVersion("1.6.0-canary.abc")).toEqual({
      base: "1.6.0-canary.abc",
      channel: "development",
      build: null,
      full: "1.6.0-canary.abc",
    })
  })
})
