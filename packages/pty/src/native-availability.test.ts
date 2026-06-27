import { describe, expect, it } from "bun:test"
import {
  checkNativePtyAvailable,
  nativePtyAvailable,
} from "./native-availability"

describe("native-availability", () => {
  it("checkNativePtyAvailable sets the flag and returns a boolean without throwing", () => {
    const ok = checkNativePtyAvailable()
    expect(typeof ok).toBe("boolean")
    expect(nativePtyAvailable()).toBe(ok)
  })
})
