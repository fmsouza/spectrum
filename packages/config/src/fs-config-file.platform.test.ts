import { afterEach, describe, expect, it } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isOk } from "@spectrum/utils"
import { createFsConfigFile } from "./fs-config-file"

const dirs: string[] = []
const freshFile = (): string => {
  const dir = join(tmpdir(), `lk-cfg-${crypto.randomUUID()}`)
  dirs.push(dir)
  return join(dir, "config.json")
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

describe("createFsConfigFile (platform-aware permissions)", () => {
  it("writes and reads back atomically on the windows branch (no chmod) when platform is windows", async () => {
    const file = createFsConfigFile(freshFile(), "windows")
    const wrote = await file.writeAtomic('{"v":1}')
    expect(isOk(wrote)).toBe(true)
    const read = await file.read()
    expect(read).toEqual({ ok: true, value: '{"v":1}' })
  })

  it("writes and reads back atomically on the posix branch when platform is linux", async () => {
    const file = createFsConfigFile(freshFile(), "linux")
    const wrote = await file.writeAtomic('{"v":2}')
    expect(isOk(wrote)).toBe(true)
    const read = await file.read()
    expect(read).toEqual({ ok: true, value: '{"v":2}' })
  })
})
