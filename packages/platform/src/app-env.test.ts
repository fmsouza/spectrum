import { describe, expect, it } from "bun:test"
import { detectAppEnv } from "./app-env"

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
