import type { Provider, SdkProvider } from "@spectrum/types"
import { type Clock, type Result, isOk, ok } from "@spectrum/utils"
import type { LanguageModelGateway } from "./gateway"
import type { ModelHandle, ProviderFactory } from "./providers/factory"
import type { NormalizedRequest, ProxyError } from "./types"

/** The outcome of a connectivity probe: whether it succeeded and how long it took. */
export type ProviderTestResult = {
  readonly ok: boolean
  readonly latencyMs: number
}

/** A connectivity probe: build the model, stream one cheap token, report ok + latency. */
export type ProviderTester = (
  provider: Provider,
  providerModel: string,
) => Promise<Result<ProviderTestResult, ProxyError>>

/** Inline (un-saved) probe input: resolved secret VALUES, never keychain refs. */
export type DraftProbeInput = {
  readonly sdkProvider: SdkProvider
  readonly config: Readonly<Record<string, string>>
  readonly secrets: Readonly<Record<string, string>>
  readonly providerModel: string
}

/** A draft connectivity probe over inline values. */
export type DraftProviderTester = (
  input: DraftProbeInput,
) => Promise<Result<ProviderTestResult, ProxyError>>

/** The minimal probe request: a single short user turn capped at one output token (security/perf). */
const pingRequest = (providerModel: string): NormalizedRequest => ({
  model: providerModel,
  messages: [{ role: "user", content: "ping" }],
  maxTokens: 1,
  stream: true,
})

/** Shared probe: given a built model Result, stream one ping and measure latency. */
const probe = async (
  model: Result<ModelHandle, ProxyError>,
  providerModel: string,
  gateway: LanguageModelGateway,
  clock: Clock,
  start: number,
): Promise<Result<ProviderTestResult, ProxyError>> => {
  if (!isOk(model)) return ok({ ok: false, latencyMs: 0 })
  let streamErrored = false
  try {
    for await (const event of gateway.stream(
      model.value,
      pingRequest(providerModel),
    )) {
      if (event.type === "error") streamErrored = true
    }
  } catch {
    streamErrored = true
  }
  const latencyMs = clock.now().getTime() - start
  return ok({ ok: !streamErrored, latencyMs })
}

/**
 * Build a provider connectivity tester over the proxy's existing seams. `getModel` resolves the
 * provider (secrets + lazy SDK + cache); `gateway.stream` runs the actual call. Latency is measured
 * with the injected `Clock` (deterministic in tests). A factory failure or a streamed `error` event
 * yields `{ ok: false }` (NOT an `Err` — the probe itself succeeded in determining the provider is
 * unreachable); the `Err<ProxyError>` channel is reserved for a probe that could not run at all.
 * PERFORMANCE/SECURITY: the request is one short message with `maxTokens: 1` — the cheapest probe.
 */
export const createProviderTester = (deps: {
  readonly factory: ProviderFactory
  readonly gateway: LanguageModelGateway
  readonly clock: Clock
}): ProviderTester => {
  return async (provider, providerModel) => {
    const start = deps.clock.now().getTime()
    const model = await deps.factory.getModel(provider, providerModel)
    return probe(model, providerModel, deps.gateway, deps.clock, start)
  }
}

/**
 * Draft connectivity tester over inline (un-saved) values. Mirrors createProviderTester
 * but builds via getModelFromResolved (no keychain, no persistence).
 */
export const createDraftProviderTester = (deps: {
  readonly factory: ProviderFactory
  readonly gateway: LanguageModelGateway
  readonly clock: Clock
}): DraftProviderTester => {
  return async ({ sdkProvider, config, secrets, providerModel }) => {
    const start = deps.clock.now().getTime()
    const model = await deps.factory.getModelFromResolved({
      sdkProvider,
      config,
      secrets,
      providerModel,
    })
    return probe(model, providerModel, deps.gateway, deps.clock, start)
  }
}
