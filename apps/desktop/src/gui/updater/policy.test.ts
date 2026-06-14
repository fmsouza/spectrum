import { describe, expect, it } from "bun:test"
import { decideBanner } from "./policy"

describe("decideBanner", () => {
  it("hides when no update is available", () => {
    expect(
      decideBanner({
        available: false,
        latestVersion: null,
        dismissedVersion: null,
      }),
    ).toBe("hidden")
  })

  it("shows when an update is available and nothing was dismissed", () => {
    expect(
      decideBanner({
        available: true,
        latestVersion: "1.2.0",
        dismissedVersion: null,
      }),
    ).toBe("show")
  })

  it("hides when the available version equals the dismissed version", () => {
    expect(
      decideBanner({
        available: true,
        latestVersion: "1.2.0",
        dismissedVersion: "1.2.0",
      }),
    ).toBe("hidden")
  })

  it("shows again when a newer version supersedes the dismissed one", () => {
    expect(
      decideBanner({
        available: true,
        latestVersion: "1.3.0",
        dismissedVersion: "1.2.0",
      }),
    ).toBe("show")
  })

  it("hides when available is true but latestVersion is null (defensive)", () => {
    expect(
      decideBanner({
        available: true,
        latestVersion: null,
        dismissedVersion: null,
      }),
    ).toBe("hidden")
  })
})
