import { describe, expect, it } from "bun:test"
import type { ProjectId } from "@launchkit/types"
import { IpcMethodSchemas } from "./methods"

describe("projects IPC schemas", () => {
  it("defines getProjects with a project-array result", () => {
    const parsed = IpcMethodSchemas.getProjects.result.parse([
      { id: "prj_1", name: "api", path: "/a", sessionCount: 3 },
    ])
    expect(parsed[0]?.sessionCount).toBe(3)
  })

  it("accepts a projectId on getSessions params", () => {
    const parsed = IpcMethodSchemas.getSessions.params.parse({
      projectId: "prj_1" as ProjectId,
      limit: 10,
    })
    expect(parsed?.projectId).toBe("prj_1" as ProjectId)
  })

  it("round-trips collapsedProjects through setCollapsedProjects", () => {
    const parsed = IpcMethodSchemas.setCollapsedProjects.params.parse({
      ids: ["prj_1", "prj_2"],
    })
    expect(parsed.ids).toHaveLength(2)
  })

  it("includes collapsedProjects in the settings result", () => {
    const parsed = IpcMethodSchemas.getSettings.result.parse({
      lastSelectedFolder: "",
      lastSelectedHarnessId: "",
      collapsedProjects: ["prj_1"],
    })
    expect(parsed.collapsedProjects).toEqual(["prj_1"])
  })
})
