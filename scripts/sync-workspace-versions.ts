/**
 * Syncs every workspace package.json `version` to the monorepo root version.
 * The pure `computeVersionUpdates` decides what changes; the fs shell (added in a
 * later task) applies them.
 */
import { Glob } from "bun"

export type Manifest = { readonly path: string; readonly version?: string }
export type VersionUpdate = {
  readonly path: string
  readonly nextVersion: string
}

export function computeVersionUpdates(
  rootVersion: string,
  manifests: readonly Manifest[],
): VersionUpdate[] {
  return manifests
    .filter((m) => m.version !== rootVersion)
    .map((m) => ({ path: m.path, nextVersion: rootVersion }))
}

async function discoverWorkspaceManifestPaths(): Promise<string[]> {
  const patterns = [
    "apps/*/package.json",
    "packages/*/package.json",
    "tooling/*/package.json",
  ]
  const paths: string[] = []
  for (const pattern of patterns) {
    for await (const file of new Glob(pattern).scan(".")) {
      paths.push(file)
    }
  }
  return paths.sort()
}

async function main(): Promise<void> {
  const root = (await Bun.file("package.json").json()) as { version?: unknown }
  if (typeof root.version !== "string" || root.version.length === 0) {
    console.error(
      "sync-workspace-versions: root package.json has no valid `version` (run from the monorepo root)",
    )
    process.exit(1)
  }
  const rootVersion = root.version
  const paths = await discoverWorkspaceManifestPaths()
  const manifests: Manifest[] = await Promise.all(
    paths.map(async (path) => ({
      path,
      version: ((await Bun.file(path).json()) as { version?: string }).version,
    })),
  )
  const updates = computeVersionUpdates(rootVersion, manifests)
  for (const update of updates) {
    const json = (await Bun.file(update.path).json()) as Record<string, unknown>
    json.version = update.nextVersion
    await Bun.write(update.path, `${JSON.stringify(json, null, 2)}\n`)
  }
  console.log(
    `Synced ${updates.length} package.json file(s) to ${rootVersion}`,
  )
}

if (import.meta.main) {
  await main()
}
