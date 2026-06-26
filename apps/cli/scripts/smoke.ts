#!/usr/bin/env bun
/**
 * Light CLI smoke test — verifies the compiled `spectrum-cli` binary exists
 * and runs --help and `list` end-to-end with a zero exit code. Per the
 * spec §"Target topology" and plan §"Stage 2": this is a real-binary test
 * (not a unit test), so it lives in `scripts/` and is invoked by
 * `bun run smoke` locally and by CI.
 *
 * Cross-platform: the Windows binary name carries a `.exe` suffix.
 */

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

/** Pick the compiled binary name for the current platform. Pure helper (unit-testable). */
export function parseSmokeArgs(platform: NodeJS.Platform): { binName: string } {
  return { binName: platform === "win32" ? "spectrum-cli.exe" : "spectrum-cli" }
}

function binPath(rootDir: string, binName: string): string {
  return resolve(rootDir, "apps/cli/dist", binName)
}

function runOrExit(bin: string, args: readonly string[]): void {
  const result = spawnSync(bin, args, { encoding: "utf8" })
  if (result.status !== 0) {
    console.error(
      `smoke FAILED: ${bin} ${args.join(" ")} -> exit ${result.status}\n${result.stderr ?? ""}`,
    )
    process.exit(1)
  }
  if (!result.stdout || result.stdout.length === 0) {
    console.error(`smoke FAILED: ${bin} ${args.join(" ")} -> empty stdout`)
    process.exit(1)
  }
}

function main(): void {
  const rootDir = resolve(import.meta.dir, "../../..")
  const { binName } = parseSmokeArgs(process.platform)
  const bin = binPath(rootDir, binName)
  if (!existsSync(bin)) {
    console.error(
      `smoke FAILED: ${bin} not found. Run \`bun run --filter spectrum-cli compile\` first.`,
    )
    process.exit(1)
  }

  console.log(`smoke: ${bin} --help`)
  runOrExit(bin, ["--help"])

  console.log(`smoke: ${bin} list`)
  runOrExit(bin, ["list"])

  console.log("smoke OK")
}

if (import.meta.main) {
  main()
}
