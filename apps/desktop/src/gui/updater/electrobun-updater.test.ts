import { describe, expect, it } from "bun:test"
import { createElectrobunUpdater } from "./electrobun-updater"
import type { UpdaterEngine } from "./electrobun-updater"

const baseEngine = (over: Partial<UpdaterEngine> = {}): UpdaterEngine => ({
  checkForUpdate: async () => ({
    version: "1.0.0",
    hash: "h",
    updateAvailable: false,
  }),
  downloadUpdate: async () => {},
  applyUpdate: async () => {},
  onStatusChange: () => {},
  localInfo: { version: async () => "1.0.0" },
  ...over,
})

describe("createElectrobunUpdater", () => {
  it("maps an available check to the available phase", async () => {
    const u = createElectrobunUpdater({
      loadEngine: async () =>
        baseEngine({
          checkForUpdate: async () => ({
            version: "1.1.0",
            hash: "h2",
            updateAvailable: true,
          }),
        }),
    })
    const r = await u.check("stable")
    expect(r.ok).toBe(true)
    expect(u.getRaw().phase).toBe("available")
    expect(u.getRaw().latestVersion).toBe("1.1.0")
    expect(u.getRaw().currentVersion).toBe("1.0.0")
  })

  it("maps a failed check fetch to an offline error", async () => {
    const u = createElectrobunUpdater({
      loadEngine: async () =>
        baseEngine({
          checkForUpdate: async () => {
            throw new Error("network down")
          },
        }),
    })
    const r = await u.check("stable")
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe("offline")
    expect(u.getRaw().phase).toBe("error")
  })

  it("relays download status entries into the raw snapshot", async () => {
    let emit:
      | ((e: { status: string; details?: { progress?: number } }) => void)
      | null = null
    const u = createElectrobunUpdater({
      loadEngine: async () =>
        baseEngine({
          onStatusChange: (cb) => {
            emit = cb
          },
          downloadUpdate: async () => {
            emit?.({ status: "download-progress", details: { progress: 0.5 } })
            emit?.({ status: "download-complete" })
          },
        }),
    })
    await u.check("stable")
    u.startDownload()
    await new Promise((r) => setTimeout(r, 0))
    expect(u.getRaw().phase).toBe("downloaded")
  })

  it("does not regress phase to error when a late error event follows download-complete", async () => {
    let emit:
      | ((e: { status: string; details?: { progress?: number } }) => void)
      | null = null
    const u = createElectrobunUpdater({
      loadEngine: async () =>
        baseEngine({
          onStatusChange: (cb) => {
            emit = cb
          },
          downloadUpdate: async () => {
            emit?.({ status: "download-complete" })
            emit?.({ status: "error" })
          },
        }),
    })
    await u.check("stable")
    u.startDownload()
    await new Promise((r) => setTimeout(r, 0))
    expect(u.getRaw().phase).toBe("downloaded")
  })

  it("setChannel rewrites the channel field in version.json", async () => {
    const initialJson = JSON.stringify({
      identifier: "x",
      channel: "stable",
      version: "1.0.0",
      hash: "h",
      baseUrl: "u",
      name: "Spectrum",
    })
    let written: string | null = null
    const u = createElectrobunUpdater({
      loadEngine: async () => baseEngine(),
      versionFile: {
        read: async () => initialJson,
        write: async (contents) => {
          written = contents
        },
      },
    })
    const r = await u.setChannel("canary")
    expect(r.ok).toBe(true)
    expect(written).not.toBeNull()
    const parsed = JSON.parse(written ?? "") as Record<string, unknown>
    expect(parsed.channel).toBe("canary")
    expect(parsed.version).toBe("1.0.0")
    expect(parsed.hash).toBe("h")
    expect(parsed.baseUrl).toBe("u")
  })

  it("setChannel resolves ok even when the version file write fails", async () => {
    const u = createElectrobunUpdater({
      loadEngine: async () => baseEngine(),
      versionFile: {
        read: async () =>
          JSON.stringify({
            identifier: "x",
            channel: "stable",
            version: "1.0.0",
            hash: "h",
            baseUrl: "u",
            name: "Spectrum",
          }),
        write: async () => {
          throw new Error("read-only filesystem")
        },
      },
    })
    const r = await u.setChannel("canary")
    expect(r.ok).toBe(true)
  })
})
