#!/usr/bin/env bun
import { runCli } from "@launchkit/cli"
import type { CliError } from "@launchkit/cli"
import type { Result } from "@launchkit/utils"
import { cliDepsFrom } from "./cli-deps"
import { createAppContext } from "./composition"

/** Seams so the entry is unit-testable without real subsystems or a real process. */
export type CliMainDeps = {
  readonly run: (argv: readonly string[]) => Promise<Result<void, CliError>>
  readonly exit: (code: number) => void
  readonly errOut: (line: string) => void
}

/** Run the CLI, map the Result to an exit code + stderr line. */
export const runCliMain = async (
  argv: readonly string[],
  deps: CliMainDeps,
): Promise<void> => {
  const result = await deps.run(argv)
  if (result.ok) {
    deps.exit(0)
    return
  }
  deps.errOut(`launchkit: ${JSON.stringify(result.error)}`)
  deps.exit(1)
}

// --- entry point: the single side effect -------------------------------------------
// Both `bun run src/cli.ts <verb>` and the compiled binary `./launchkit-cli <verb>` produce a
// `process.argv` shaped `[runtime, scriptPath, ...userArgs]`, so the CLI verb sits at index 2.
// `runCli`/`parseArgs` treat the first token as the command, so drop the two-element prefix here.
if (import.meta.main) {
  const ctx = createAppContext()
  await runCliMain(process.argv.slice(2), {
    run: (argv) => runCli(cliDepsFrom(ctx))(argv),
    exit: (code) => process.exit(code),
    errOut: (line) => process.stderr.write(`${line}\n`),
  })
}
