import { describe, expect, it } from "bun:test"
import * as db from "./index"

describe("@spectrum/db barrel", () => {
  it("exports the public API when imported", () => {
    expect(Object.keys(db).sort()).toEqual(
      [
        "createSqliteClient",
        "projects",
        "runEvents",
        "runMigrations",
        "sessions",
        "tryDb",
      ].sort(),
    )
  })
})
