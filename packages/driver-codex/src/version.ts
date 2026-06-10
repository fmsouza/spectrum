/**
 * The pinned `codex` CLI version whose `app-server` protocol bindings live in `./bindings`.
 * REGEN ON UPGRADE: `codex app-server generate-ts --out packages/driver-codex/src/bindings --experimental`
 * then update this constant. app-server is `[experimental]`; method/item shapes may drift across versions.
 */
export const CODEX_APP_SERVER_VERSION = "0.130.0" as const
