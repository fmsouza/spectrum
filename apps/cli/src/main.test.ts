import { describe, expect, it } from "bun:test"
import {
  buildFakeAppContextDeps,
  createAppContext,
} from "@spectrum/runtime-core"
import { cliDepsFrom } from "./cli-deps"

describe("CLI entry wiring", () => {
  it("cliDepsFrom(createAppContext(fakeDeps)) produces a valid CliDeps", () => {
    const fakeDeps = buildFakeAppContextDeps()
    const ctx = createAppContext(fakeDeps)
    const cliDeps = cliDepsFrom(ctx)

    // Every required CliDeps field is present and matches the AppContext projection.
    expect(cliDeps.config).toBe(ctx.config)
    expect(cliDeps.secrets).toBe(ctx.secrets)
    expect(cliDeps.sessions).toBe(ctx.sessions)
    expect(cliDeps.projects).toBe(ctx.projects)
    expect(cliDeps.runtime).toBe(ctx.runtime)
    expect(cliDeps.registry).toBe(ctx.registry)
    expect(cliDeps.launch).toBe(ctx.launch)
    expect(cliDeps.genProxyKey).toBe(ctx.genProxyKey)

    // Proxy surface is the AppContext proxy projected to StartProxyDeps.
    expect(cliDeps.proxy.isRunning).toBe(ctx.proxy.isRunning)
    expect(typeof cliDeps.proxy.start).toBe("function")

    // Logger is scoped to the CLI subsystem.
    expect(cliDeps.logger).toBeDefined()

    // Writer writes to stdout.
    expect(typeof cliDeps.out.write).toBe("function")
  })
})
