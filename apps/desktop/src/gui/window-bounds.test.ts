import { describe, expect, it } from "bun:test"
import { SettingsSchema } from "@spectrum/config"
import {
  DEFAULT_BOUNDS,
  boundsToFrame,
  sanitizeBounds,
  settingsWithBounds,
} from "./window-bounds"

const validBounds = { width: 1280, height: 800, x: 50, y: 60 }

describe("sanitizeBounds", () => {
  it("returns null when given null", () => {
    expect(sanitizeBounds(null)).toBeNull()
  })

  it("returns the bounds unchanged when they are valid and on-screen", () => {
    expect(sanitizeBounds(validBounds)).toEqual(validBounds)
  })

  it("returns null when width is below the minimum", () => {
    expect(sanitizeBounds({ ...validBounds, width: 100 })).toBeNull()
  })

  it("returns null when height is below the minimum", () => {
    expect(sanitizeBounds({ ...validBounds, height: 100 })).toBeNull()
  })

  it("returns null when a coordinate is not finite (NaN/Infinity)", () => {
    expect(sanitizeBounds({ ...validBounds, x: Number.NaN })).toBeNull()
    expect(
      sanitizeBounds({ ...validBounds, height: Number.POSITIVE_INFINITY }),
    ).toBeNull()
  })

  it("returns null when the position is off-screen (disconnected monitor)", () => {
    expect(sanitizeBounds({ ...validBounds, x: 999999 })).toBeNull()
    expect(sanitizeBounds({ ...validBounds, y: -999999 })).toBeNull()
  })
})

describe("boundsToFrame", () => {
  it("returns DEFAULT_BOUNDS when bounds is null", () => {
    expect(boundsToFrame(null)).toEqual(DEFAULT_BOUNDS)
  })

  it("returns the bounds as the frame when provided", () => {
    expect(boundsToFrame(validBounds)).toEqual(validBounds)
  })
})

describe("settingsWithBounds", () => {
  it("sets windowBounds while preserving every other setting", () => {
    const base = SettingsSchema.parse({ proxyPort: 4123 })
    const next = settingsWithBounds(base, validBounds)
    expect(next.windowBounds).toEqual(validBounds)
    expect(next.proxyPort).toBe(4123)
    expect(next.proxyHost).toBe("127.0.0.1")
  })

  it("does not mutate the input settings", () => {
    const base = SettingsSchema.parse({})
    settingsWithBounds(base, validBounds)
    expect(base.windowBounds).toBeNull()
  })
})
