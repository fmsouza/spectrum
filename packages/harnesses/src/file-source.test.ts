import { describe, expect, it } from "bun:test"
import type { HarnessDefinition } from "@launchkit/types"
import { createInMemoryHarnessFileSource } from "./file-source"

const fixture = (id: string): HarnessDefinition =>
  ({
    id,
    name: `Harness ${id}`,
    command: "claude",
    apiFormat: "anthropic",
    envTemplate: { ANTHROPIC_BASE_URL: "{{baseUrl}}" },
    defaultAlias: "default",
    description: "a test harness",
    builtIn: false,
  }) as unknown as HarnessDefinition

describe("createInMemoryHarnessFileSource", () => {
  it("records a written definition so a subsequent list returns it", async () => {
    const source = createInMemoryHarnessFileSource([])
    const written = await source.writeDefinition(fixture("alpha"))
    expect(written.ok).toBe(true)

    const listed = await source.listDefinitions()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      const ids = listed.value.map((d) => (d as { id: string }).id)
      expect(ids).toEqual(["alpha"])
    }
  })

  it("replaces an existing definition with the same id on write", async () => {
    const source = createInMemoryHarnessFileSource([fixture("alpha")])
    const replacement = { ...fixture("alpha"), name: "Renamed" }
    const written = await source.writeDefinition(replacement)
    expect(written.ok).toBe(true)

    const listed = await source.listDefinitions()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.value).toHaveLength(1)
      expect((listed.value[0] as { name: string }).name).toBe("Renamed")
    }
  })

  it("removes a definition by id when deleteDefinition is called", async () => {
    const source = createInMemoryHarnessFileSource([
      fixture("alpha"),
      fixture("beta"),
    ])
    const deleted = await source.deleteDefinition("alpha")
    expect(deleted.ok).toBe(true)

    const listed = await source.listDefinitions()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      const ids = listed.value.map((d) => (d as { id: string }).id)
      expect(ids).toEqual(["beta"])
    }
  })

  it("returns the preset failure from writeDefinition when configured", async () => {
    const source = createInMemoryHarnessFileSource([], {
      kind: "write-failed",
      detail: "boom",
    })
    const written = await source.writeDefinition(fixture("alpha"))
    expect(written.ok).toBe(false)
    if (!written.ok) expect(written.error.kind).toBe("write-failed")
  })

  it("returns the preset failure from deleteDefinition when configured", async () => {
    const source = createInMemoryHarnessFileSource([], {
      kind: "write-failed",
      detail: "boom",
    })
    const deleted = await source.deleteDefinition("alpha")
    expect(deleted.ok).toBe(false)
    if (!deleted.ok) expect(deleted.error.kind).toBe("write-failed")
  })
})
