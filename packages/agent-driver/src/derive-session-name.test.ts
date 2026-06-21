import { describe, expect, it } from "bun:test"
import { deriveSessionName } from "./derive-session-name"

describe("deriveSessionName", () => {
  it("trims surrounding whitespace", () => {
    expect(deriveSessionName("  Fix the bug  ")).toBe("Fix the bug")
  })

  it("collapses internal whitespace runs to single spaces", () => {
    expect(deriveSessionName("Fix    the     bug")).toBe("Fix the bug")
  })

  it("collapses newlines to spaces (single-lines a multiline prompt)", () => {
    expect(deriveSessionName("Fix the\n  bug\nnow")).toBe("Fix the bug now")
  })

  it("truncates at 80 characters", () => {
    const long = "a".repeat(120)
    expect(deriveSessionName(long)).toHaveLength(80)
    expect(deriveSessionName(long)).toBe("a".repeat(80))
  })

  it("truncates a multiline prompt at 80 chars after collapsing to one line", () => {
    const long = `line one ${"x".repeat(100)}\nline two ${"y".repeat(50)}`
    expect(deriveSessionName(long)).toHaveLength(80)
  })

  it("returns empty string for blank input so the caller skips naming", () => {
    expect(deriveSessionName("")).toBe("")
    expect(deriveSessionName("   ")).toBe("")
    expect(deriveSessionName("\n\n\t  \n")).toBe("")
  })

  it("preserves a normal short prompt unchanged", () => {
    expect(deriveSessionName("Refactor the proxy layer")).toBe(
      "Refactor the proxy layer",
    )
  })

  it("truncates exactly at 80 without breaking on a word boundary when the cut is mid-word", () => {
    // A single 100-char word: the hard cut lands mid-word. No ellipsis logic required.
    const word = "z".repeat(100)
    expect(deriveSessionName(word)).toBe("z".repeat(80))
  })
})
