export { type Platform, detectPlatform } from "./platform"
export { type SpectrumEnv, detectAppEnv } from "./app-env"
export {
  type AppPaths,
  type ResolveAppPathsInput,
  resolveAppPaths,
} from "./paths"
export { isAbsolutePath } from "./abs-path"
export { defaultTerminationSignal } from "./signal"
export {
  type LegacyMacosMigration,
  type PlanLegacyMacosMigrationInput,
  legacyMacosConfigDir,
  planLegacyMacosMigration,
} from "./migration"
export {
  legacyLaunchkitDataDir,
  planLaunchkitToSpectrumMigration,
} from "./spectrum-migration"
export type {
  SpectrumMigration,
  PlanSpectrumMigrationInput,
} from "./spectrum-migration"
