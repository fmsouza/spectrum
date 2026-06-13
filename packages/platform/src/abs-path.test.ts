import { describe, expect, it } from "bun:test"
import { isAbsolutePath } from "./abs-path"

describe("isAbsolutePath", () => {
  it("treats /usr/local/bin/claude as absolute on posix platforms", () => {
    expect(isAbsolutePath("/usr/local/bin/claude", "linux")).toBe(true)
    expect(isAbsolutePath("/usr/local/bin/claude", "macos")).toBe(true)
  })
  it("treats a bare command name as not absolute on posix", () => {
    expect(isAbsolutePath("claude", "linux")).toBe(false)
  })
  it("treats C:\\tools\\claude.exe as absolute on windows", () => {
    expect(isAbsolutePath("C:\\tools\\claude.exe", "windows")).toBe(true)
  })
  it("treats a forward-slash drive path C:/tools/claude.exe as absolute on windows", () => {
    expect(isAbsolutePath("C:/tools/claude.exe", "windows")).toBe(true)
  })
  it("treats a bare command name as not absolute on windows", () => {
    expect(isAbsolutePath("claude", "windows")).toBe(false)
  })
})
