import { describe, expect, it } from "bun:test"
import { createScrollback } from "./scrollback"

const dec = (u: Uint8Array): string => new TextDecoder().decode(u)

describe("createScrollback", () => {
  it("accumulates appended chunks and returns them as one snapshot", () => {
    const sb = createScrollback(1024)
    sb.append(new TextEncoder().encode("abc"))
    sb.append(new TextEncoder().encode("def"))
    expect(dec(sb.snapshot())).toBe("abcdef")
  })

  it("drops the oldest bytes when the byte cap is exceeded", () => {
    const sb = createScrollback(4)
    sb.append(new TextEncoder().encode("abcdef"))
    expect(dec(sb.snapshot())).toBe("cdef")
  })
})
