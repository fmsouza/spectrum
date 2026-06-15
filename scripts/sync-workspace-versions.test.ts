import { describe, expect, it } from "bun:test"
import { computeVersionUpdates } from "./sync-workspace-versions"

describe("computeVersionUpdates", () => {
  it("returns no updates when every manifest already matches the root version", () => {
    const updates = computeVersionUpdates("1.1.0", [
      { path: "packages/a/package.json", version: "1.1.0" },
      { path: "packages/b/package.json", version: "1.1.0" },
    ])
    expect(updates).toEqual([])
  })

  it("returns an update for each manifest whose version differs from root", () => {
    const updates = computeVersionUpdates("1.1.0", [
      { path: "packages/a/package.json", version: "0.1.0" },
      { path: "packages/b/package.json", version: "1.1.0" },
    ])
    expect(updates).toEqual([
      { path: "packages/a/package.json", nextVersion: "1.1.0" },
    ])
  })

  it("treats a missing version field as needing an update", () => {
    const updates = computeVersionUpdates("1.1.0", [
      { path: "packages/a/package.json" },
    ])
    expect(updates).toEqual([
      { path: "packages/a/package.json", nextVersion: "1.1.0" },
    ])
  })

  it("returns no updates for an empty manifest list", () => {
    expect(computeVersionUpdates("1.1.0", [])).toEqual([])
  })
})
