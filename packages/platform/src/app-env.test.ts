import { describe, expect, it } from "bun:test"
import { detectAppEnv, resolveAppEnv, resolveChannel } from "./app-env"

describe("detectAppEnv", () => {
  it("returns development when SPECTRUM_ENV is exactly development", () => {
    expect(detectAppEnv({ SPECTRUM_ENV: "development" })).toBe("development")
  })

  it("returns production when SPECTRUM_ENV is unset", () => {
    expect(detectAppEnv({})).toBe("production")
  })

  it("returns production when SPECTRUM_ENV is production", () => {
    expect(detectAppEnv({ SPECTRUM_ENV: "production" })).toBe("production")
  })

  it("returns production for any other SPECTRUM_ENV value (dev, DEVELOPMENT, empty)", () => {
    expect(detectAppEnv({ SPECTRUM_ENV: "dev" })).toBe("production")
    expect(detectAppEnv({ SPECTRUM_ENV: "DEVELOPMENT" })).toBe("production")
    expect(detectAppEnv({ SPECTRUM_ENV: "" })).toBe("production")
  })
})

describe("resolveChannel", () => {
  it("returns canary when the bundled channel is canary", () => {
    expect(resolveChannel({ buildChannel: "canary", env: {} })).toBe("canary")
  })
  it("returns development when the bundled channel is dev", () => {
    expect(resolveChannel({ buildChannel: "dev", env: {} })).toBe("development")
  })
  it("returns stable for the stable channel", () => {
    expect(resolveChannel({ buildChannel: "stable", env: {} })).toBe("stable")
  })
  it("falls back to SPECTRUM_ENV when no channel is bundled", () => {
    expect(
      resolveChannel({
        buildChannel: undefined,
        env: { SPECTRUM_ENV: "development" },
      }),
    ).toBe("development")
    expect(resolveChannel({ buildChannel: undefined, env: {} })).toBe("stable")
  })
})

describe("resolveAppEnv", () => {
  it("returns development when the bundled channel is dev", () => {
    expect(resolveAppEnv({ buildChannel: "dev", env: {} })).toBe("development")
  })

  it("returns production when the bundled channel is stable", () => {
    expect(resolveAppEnv({ buildChannel: "stable", env: {} })).toBe(
      "production",
    )
  })

  it("returns production when the bundled channel is canary", () => {
    expect(resolveAppEnv({ buildChannel: "canary", env: {} })).toBe(
      "production",
    )
  })

  it("lets the bundled stable channel override an ambient SPECTRUM_ENV=development", () => {
    expect(
      resolveAppEnv({
        buildChannel: "stable",
        env: { SPECTRUM_ENV: "development" },
      }),
    ).toBe("production")
  })

  it("falls back to SPECTRUM_ENV when no bundle channel is present", () => {
    expect(
      resolveAppEnv({
        buildChannel: undefined,
        env: { SPECTRUM_ENV: "development" },
      }),
    ).toBe("development")
    expect(resolveAppEnv({ buildChannel: undefined, env: {} })).toBe(
      "production",
    )
  })
})
