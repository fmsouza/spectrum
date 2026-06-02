import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCli } from "@launchkit/cli"
import { createMemoryWriter } from "@launchkit/cli"
import {
  type Config,
  createCachedConfigStore,
  createFileConfigStore,
  createFsConfigFile,
  exportConfig,
} from "@launchkit/config"
import {
  builtinHarnesses,
  createInMemoryHarnessFileSource,
  createRegistry,
} from "@launchkit/harnesses"
import {
  createRouter,
  createScriptedGateway,
  isProxyRunning,
  startProxy,
} from "@launchkit/proxy"
import { buildTrayMenu } from "./gui/tray-menu"

const dirs: string[] = []

const freshConfig = async (): Promise<{
  store: ReturnType<typeof createCachedConfigStore>
  path: string
}> => {
  const dir = await mkdtemp(join(tmpdir(), "launchkit-e2e-"))
  dirs.push(dir)
  const path = join(dir, "config.json")
  const config: Config = {
    version: 2,
    providers: [
      {
        id: "p1",
        name: "Local",
        sdkProvider: "openai",
        config: {},
        secrets: {},
        models: ["gpt-4o"],
      },
    ],
    aliases: [{ alias: "default", providerId: "p1", providerModel: "gpt-4o" }],
    settings: { proxyPort: 4000, proxyHost: "127.0.0.1" },
  } as Config
  await writeFile(path, exportConfig(config), "utf8")
  return {
    store: createCachedConfigStore(
      createFileConfigStore({ file: createFsConfigFile(path) }),
    ),
    path,
  }
}

let stopProxy: (() => void) | undefined
afterEach(async () => {
  stopProxy?.()
  stopProxy = undefined
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true })
})

// These end-to-end paths (CLI over fakes, a real loopback proxy on an ephemeral port, the pure
// tray-menu descriptor) are platform-agnostic — run them everywhere, including Linux CI.
describe("LaunchKit end-to-end", () => {
  it("runs the CLI `list harnesses` against a temp config and prints the built-in ids", async () => {
    const { store } = await freshConfig()
    const out = createMemoryWriter()
    const deps = {
      config: store,
      secrets: {
        set: async () => ({ ok: true, value: { ref: "kc" } }),
        get: async () => ({ ok: true, value: "x" }),
        delete: async () => ({ ok: true, value: undefined }),
        has: async () => false,
      },
      sessions: {
        init: () => ({ ok: true, value: undefined }),
        create: () => ({ ok: true, value: {} }),
        close: () => ({ ok: true, value: {} }),
        query: () => ({ ok: true, value: [] }),
      },
      registry: {
        list: async () => ({ ok: true as const, value: builtinHarnesses }),
      },
      launch: () => ({ ok: true as const, value: { pid: 1 } }),
      proxy: {
        isRunning: async () => false,
        start: () => ({
          hostname: "127.0.0.1",
          port: 0,
          stop: () => {},
        }),
      },
      genProxyKey: () => "k",
      out,
    } as never

    const result = await runCli(deps)(["list", "harnesses"])

    expect(result.ok).toBe(true)
    expect(out.lines.join("\n")).toContain("claude")
  })

  it("answers /health from a real loopback proxy on an ephemeral port", async () => {
    const { store } = await freshConfig()
    const loaded = await store.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const running = startProxy({
      host: "127.0.0.1",
      port: 0,
      proxyKey: "k",
      router: createRouter(loaded.value),
      factory: { getModel: async () => ({ ok: true, value: {} }) },
      gateway: createScriptedGateway([
        { type: "finish", finishReason: "stop" },
      ]),
      listAliases: () => loaded.value.aliases.map((a) => String(a.alias)),
    })
    stopProxy = running.stop

    expect(running.hostname).toBe("127.0.0.1")
    expect(await isProxyRunning(`http://127.0.0.1:${running.port}`)).toBe(true)
  })

  it("builds a tray menu reflecting the configured harnesses and proxy status", async () => {
    const registry = createRegistry({
      fileSource: createInMemoryHarnessFileSource([]),
    })
    const listed = await registry.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return

    const menu = buildTrayMenu({
      harnesses: listed.value,
      proxyRunning: true,
    })

    expect(menu.items[0]).toMatchObject({
      kind: "status",
      dot: { state: "on", color: "green" },
    })
    const submenu = menu.items.find((i) => i.kind === "submenu")
    expect(
      submenu?.kind === "submenu" &&
        submenu.items.map((i) => (i.kind === "launch" ? i.harnessId : i.kind)),
    ).toContain("claude")
  })
})
