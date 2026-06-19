import { describe, expect, it } from "bun:test"

import config from "./electrobun.config"

describe("electrobun.config macOS signing", () => {
  it("enables codesign so channel builds are signed", () => {
    expect(config.build.mac.codesign).toBe(true)
  })

  it("enables notarization so channel builds are notarized + stapled", () => {
    expect(config.build.mac.notarize).toBe(true)
  })
})
