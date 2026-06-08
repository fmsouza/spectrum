import { describe, expect, it } from "bun:test"
import { ProjectSchema } from "./project"

describe("ProjectSchema", () => {
  it("accepts a well-formed project when all fields are present", () => {
    const parsed = ProjectSchema.parse({
      id: "prj_1",
      name: "launchkit",
      path: "/Users/fred/projects/personal/launchkit",
      createdAt: "2026-06-07T10:00:00.000Z",
    })
    expect(parsed.name).toBe("launchkit")
  })

  it("rejects an empty name when name is blank", () => {
    expect(() =>
      ProjectSchema.parse({
        id: "prj_1",
        name: "",
        path: "/x",
        createdAt: "2026-06-07T10:00:00.000Z",
      }),
    ).toThrow()
  })
})
