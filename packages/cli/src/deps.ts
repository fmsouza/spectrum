import type { Config, ConfigStore } from "@spectrum/config"
import type { LaunchParams } from "@spectrum/harnesses"
import type { Logger } from "@spectrum/logger"
import type { ProjectStore } from "@spectrum/projects"
import type { RunningProxy, RuntimeState } from "@spectrum/proxy"
import type { SecretStore } from "@spectrum/secrets"
import type { SessionStore } from "@spectrum/sessions"
import type { HarnessDefinition } from "@spectrum/types"
import type { Result } from "@spectrum/utils"
import type { Writer } from "./writer"

/** Options the CLI passes to `proxy.start` for an ephemeral launch-time proxy. */
export type StartProxyDeps = {
  readonly host: string
  readonly port: number
  readonly proxyKey: string
  readonly config: Config
}

/**
 * Everything a command needs, injected. Each field is an interface owned by another
 * package (or a tiny function seam), so commands stay pure and fully fakeable.
 *
 * - `registry.list()` mirrors `HarnessRegistry.list()` from `@spectrum/harnesses`.
 * - `launch` is `launchHarness(deps)` already partially applied by the app shell — a
 *   single call `(params) => Result<{ pid }, unknown>`.
 * - `proxy.start` returns the `RunningProxy` from `@spectrum/proxy`; `proxy.isRunning`
 *   wraps `isProxyRunning(baseUrl)`.
 * - `genProxyKey` mints the per-run ≥32-byte proxy key (security.md). Its value reaches
 *   the harness env via `launch` only — never the `Writer`.
 */
export type CliDeps = {
  readonly config: ConfigStore
  readonly secrets: SecretStore
  readonly registry: {
    list(): Promise<Result<readonly HarnessDefinition[], unknown>>
  }
  readonly launch: (
    params: LaunchParams,
  ) => Result<
    { readonly pid: number; readonly exited: Promise<number> },
    unknown
  >
  readonly proxy: {
    isRunning(baseUrl: string): Promise<boolean>
    start(opts: StartProxyDeps): RunningProxy
  }
  readonly sessions: SessionStore
  readonly projects: ProjectStore
  /**
   * Holds the running proxy's per-run key so `launch` can reuse it (instead of minting a
   * mismatched one) when a proxy — typically the GUI's persistent one — is already up.
   */
  readonly runtime: RuntimeState
  readonly out: Writer
  readonly genProxyKey: () => string
  /**
   * Optional structured logger; commands log `error` on failure (kind only).
   * Defaults to no-op.
   */
  readonly logger?: Logger
}
