import { describe, expect, it } from "bun:test"
import { buildAppMenu } from "./app-menu"

type Item = {
  label?: string
  role?: string
  accelerator?: string
  type?: string
}
type Menu = { label?: string; submenu?: Item[] }

describe("buildAppMenu", () => {
  const menu = buildAppMenu("LaunchKit") as Menu[]
  const edit = menu.find((m) => m.label === "Edit")?.submenu ?? []
  const role = (r: string): Item | undefined => edit.find((i) => i.role === r)

  it("names the first (application) submenu after the app", () => {
    expect(menu[0]?.label).toBe("LaunchKit")
  })

  it("exposes the standard Edit roles so the webview gets clipboard selectors", () => {
    for (const r of ["undo", "redo", "cut", "copy", "paste", "selectAll"])
      expect(role(r)).toBeDefined()
  })

  it("installs the standard key equivalents (Cmd+C/V/X/A)", () => {
    expect(role("copy")?.accelerator).toBe("CommandOrControl+C")
    expect(role("paste")?.accelerator).toBe("CommandOrControl+V")
    expect(role("cut")?.accelerator).toBe("CommandOrControl+X")
    expect(role("selectAll")?.accelerator).toBe("CommandOrControl+A")
  })

  it("includes Quit in the application submenu", () => {
    const app = menu[0]?.submenu ?? []
    expect(app.find((i) => i.role === "quit")).toBeDefined()
  })
})
