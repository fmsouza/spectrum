/**
 * Syncs every workspace package.json `version` to the monorepo root version.
 * The pure `computeVersionUpdates` decides what changes; the fs shell (added in a
 * later task) applies them.
 */
export type Manifest = { readonly path: string; readonly version?: string }
export type VersionUpdate = { readonly path: string; readonly nextVersion: string }

export function computeVersionUpdates(
  rootVersion: string,
  manifests: readonly Manifest[],
): VersionUpdate[] {
  return manifests
    .filter((m) => m.version !== rootVersion)
    .map((m) => ({ path: m.path, nextVersion: rootVersion }))
}
