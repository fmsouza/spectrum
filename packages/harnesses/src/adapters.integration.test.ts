import { afterEach, describe, expect, it } from "bun:test"
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { HarnessDefinition } from "@launchkit/types"
import {
  createBunProcessSpawner,
  createDirHarnessFileSource,
  createPathCommandResolver,
} from "./adapters"

const tempDirs: string[] = []
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lk-harness-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe("createPathCommandResolver (real)", () => {
  it("resolves a real on-PATH command to an absolute path", () => {
    const r = createPathCommandResolver().resolve("true")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.startsWith("/")).toBe(true)
  })

  it("rejects a relative command without touching PATH", () => {
    const r = createPathCommandResolver().resolve("./nope")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-command")
  })
})

describe("createBunProcessSpawner (real)", () => {
  it("spawns a harmless command and returns a numeric pid", () => {
    const resolver = createPathCommandResolver()
    const resolved = resolver.resolve("true")
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return

    const r = createBunProcessSpawner().spawn(resolved.value, [], {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(typeof r.value.pid).toBe("number")
  })

  it("inherits the parent env and lets rendered vars override inherited ones", async () => {
    const dir = makeTempDir()
    const outFile = join(dir, "env.json")

    // A marker present in the PARENT env; the child should be able to override it.
    const priorMarker = process.env.LK_SPAWN_MARKER
    process.env.LK_SPAWN_MARKER = "parent-value"
    try {
      const r = createBunProcessSpawner().spawn(
        process.execPath,
        [
          "-e",
          "require('fs').writeFileSync(process.env.LK_OUT, JSON.stringify({ marker: process.env.LK_SPAWN_MARKER, hasPath: Boolean(process.env.PATH) }))",
        ],
        { LK_OUT: outFile, LK_SPAWN_MARKER: "override-value" },
      )
      expect(r.ok).toBe(true)
      if (!r.ok) return
      await r.value.exited

      const captured = JSON.parse(readFileSync(outFile, "utf8")) as {
        marker: string
        hasPath: boolean
      }
      // Rendered/override vars WIN over inherited ones (proxy key authority).
      expect(captured.marker).toBe("override-value")
      // ... while the rest of the parent env (PATH) is still inherited.
      expect(captured.hasPath).toBe(true)
    } finally {
      if (priorMarker === undefined) {
        process.env.LK_SPAWN_MARKER = ""
      } else {
        process.env.LK_SPAWN_MARKER = priorMarker
      }
    }
  })

  it("spawns the child process in the given cwd", async () => {
    const dir = makeTempDir()
    const out = join(dir, "where.txt")
    const spawner = createBunProcessSpawner()
    // Write the child's cwd to a file (stdio is inherited, so assert via the filesystem).
    const r = spawner.spawn(
      "/bin/sh",
      ["-c", `pwd -P > ${out}`],
      { ...process.env } as Record<string, string>,
      dir,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await r.value.exited
    const written = readFileSync(out, "utf8").trim()
    expect(written).toBe(realpathSync(dir))
  })
})

describe("createDirHarnessFileSource (real)", () => {
  it("reads and JSON-parses every *.json file in the directory", async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, "a.json"), JSON.stringify({ id: "a" }))
    writeFileSync(join(dir, "b.json"), JSON.stringify({ id: "b" }))
    writeFileSync(join(dir, "ignore.txt"), "not json")

    const r = await createDirHarnessFileSource(dir).listDefinitions()
    expect(r.ok).toBe(true)
    if (r.ok) {
      const ids = r.value.map((d) => (d as { id: string }).id).sort()
      expect(ids).toEqual(["a", "b"])
    }
  })

  it("returns ok with an empty list when the directory does not exist", async () => {
    const r = await createDirHarnessFileSource(
      join(makeTempDir(), "missing"),
    ).listDefinitions()
    expect(r).toEqual({ ok: true, value: [] })
  })

  it("returns a read-failed error when a file contains invalid JSON", async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, "broken.json"), "{ not valid json")
    const r = await createDirHarnessFileSource(dir).listDefinitions()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("read-failed")
  })

  const definition = (id: string): HarnessDefinition =>
    ({
      id,
      name: `Harness ${id}`,
      command: "claude",
      apiFormat: "anthropic",
      envTemplate: { ANTHROPIC_BASE_URL: "{{baseUrl}}" },
      defaultAlias: "default",
      description: "an integration test harness",
      builtIn: false,
    }) as unknown as HarnessDefinition

  it("writes a harness JSON file and reads it back via listDefinitions, then deletes it", async () => {
    const dir = join(makeTempDir(), `nested-${crypto.randomUUID()}`)
    const source = createDirHarnessFileSource(dir)

    const written = await source.writeDefinition(definition("my-harness"))
    expect(written.ok).toBe(true)

    const listed = await source.listDefinitions()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.value.map((d) => (d as { id: string }).id)).toEqual([
        "my-harness",
      ])
    }
    expect(readdirSync(dir)).toContain("my-harness.json")

    const deleted = await source.deleteDefinition("my-harness")
    expect(deleted.ok).toBe(true)
    const after = await source.listDefinitions()
    expect(after).toEqual({ ok: true, value: [] })
  })

  it("returns an err when writing an invalid definition", async () => {
    const dir = makeTempDir()
    const r = await createDirHarnessFileSource(dir).writeDefinition({
      id: "bad",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid-definition")
  })

  it("treats deleting a missing id as success", async () => {
    const dir = makeTempDir()
    const r = await createDirHarnessFileSource(dir).deleteDefinition("ghost")
    expect(r).toEqual({ ok: true, value: undefined })
  })

  it("rejects an id containing path separators or '..'", async () => {
    const dir = makeTempDir()
    const source = createDirHarnessFileSource(dir)

    for (const badId of ["../escape", "a/b", "a\\b", "..", ""]) {
      const write = await source.writeDefinition(definition(badId))
      expect(write.ok).toBe(false)
      const del = await source.deleteDefinition(badId)
      expect(del.ok).toBe(false)
    }

    // Nothing escaped the directory.
    expect(readdirSync(dir)).toEqual([])
  })
})
