import { describe, expect, it } from "bun:test"
import * as db from "./index"

describe("@launchkit/db barrel", () => {
  it("exports the public API when imported", () => {
    expect(Object.keys(db).sort()).toEqual(
      [
        "createSqliteClient",
        "projects",
        "runMigrations",
        "sessions",
        "tryDb",
      ].sort(),
    )
  })
})
