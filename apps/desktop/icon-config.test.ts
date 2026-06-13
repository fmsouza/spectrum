import { describe, expect, it } from "bun:test"

// Guards the macOS app-icon wiring: Electrobun reads `build.mac.icons` (a path to an
// .iconset) and runs `iconutil` at build time to emit AppIcon.icns into the bundle. If
// either the config reference or a required iconset slice goes missing, the dock falls
// back to the generic icon — so assert both here.

const config = await Bun.file(
  new URL("./electrobun.config.ts", import.meta.url),
).text()

// The 10 standard slices iconutil requires for a complete macOS app icon.
const REQUIRED_SLICES = [
  "icon_16x16.png",
  "icon_16x16@2x.png",
  "icon_32x32.png",
  "icon_32x32@2x.png",
  "icon_128x128.png",
  "icon_128x128@2x.png",
  "icon_256x256.png",
  "icon_256x256@2x.png",
  "icon_512x512.png",
  "icon_512x512@2x.png",
] as const

describe("macOS app-icon wiring", () => {
  it("points build.mac.icons at the icon.iconset", () => {
    expect(config).toContain('icons: "icon.iconset"')
  })

  it("ships every iconset slice iconutil needs", async () => {
    for (const slice of REQUIRED_SLICES) {
      const file = Bun.file(new URL(`./icon.iconset/${slice}`, import.meta.url))
      expect(await file.exists(), `${slice} must exist`).toBe(true)
    }
  })
})
