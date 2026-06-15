import { describe, expect, it } from "bun:test"
import type { DataAdminError } from "./index"

describe("@spectrum/data-admin barrel", () => {
  it("exposes the DataAdminError type shape", () => {
    const e: DataAdminError = { kind: "db-failed", detail: "x" }
    expect(e.kind).toBe("db-failed")
  })
})
