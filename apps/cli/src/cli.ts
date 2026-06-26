#!/usr/bin/env bun
import type { CliError } from "@spectrum/cli"
import type { Result } from "@spectrum/utils"

/**
 * Render a `CliError` as a single human-readable line (no trailing newline — the caller adds it).
 * Exhaustive over the union so a new `CliError` variant becomes a compile error here.
 */
export const formatCliError = (error: CliError): string => {
  switch (error.kind) {
    case "unknown-command":
      return `spectrum: unknown command "${error.command}"`
    case "usage":
      return `spectrum: ${error.detail}`
    case "failed":
      return `spectrum: ${error.detail}`
  }
}

/** Seams so the entry is unit-testable without real subsystems or a real process. */
export type CliMainDeps = {
  readonly run: (argv: readonly string[]) => Promise<Result<void, CliError>>
  readonly exit: (code: number) => void
  /** Write one diagnostic line to stderr. Receives the line WITHOUT a trailing newline. */
  readonly errOut: (line: string) => void
}

/** Run the CLI, map the Result to an exit code + a human-readable stderr line. */
export const runCliMain = async (
  argv: readonly string[],
  deps: CliMainDeps,
): Promise<void> => {
  const result = await deps.run(argv)
  if (result.ok) {
    deps.exit(0)
    return
  }
  deps.errOut(formatCliError(result.error))
  deps.exit(1)
}
