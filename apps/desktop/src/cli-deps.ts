import type { CliDeps, StartProxyDeps } from "@launchkit/cli"
import type { AppContext } from "./composition"

/** Assemble the CliDeps the CLI runner needs from a wired AppContext. */
export const cliDepsFrom = (ctx: AppContext): CliDeps => ({
  config: ctx.config,
  secrets: ctx.secrets,
  sessions: ctx.sessions,
  registry: ctx.registry,
  launch: ctx.launch,
  proxy: {
    isRunning: ctx.proxy.isRunning,
    start: (opts: StartProxyDeps) =>
      ctx.proxy.start({
        host: opts.host,
        port: opts.port,
        proxyKey: opts.proxyKey,
        config: opts.config,
      }),
  },
  genProxyKey: ctx.genProxyKey,
  out: {
    write: (line: string): void => {
      process.stdout.write(`${line}\n`)
    },
  },
})
