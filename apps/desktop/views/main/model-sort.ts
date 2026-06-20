import type { ModelRoute } from "@spectrum/types"

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

/** Sort a flat list of model-id strings (single-provider). Same collator. Stable. */
export const sortModelIds = (ids: readonly string[]): readonly string[] =>
  [...ids].sort((a, b) => collator.compare(a, b))

/**
 * Sort ModelRoute[] by provider display-name (fallback providerId), then
 * providerModel. Stable: equal keys preserve input order.
 */
export const sortModelRoutes = (
  routes: readonly ModelRoute[],
  resolveName: (providerId: string) => string | undefined,
): readonly ModelRoute[] =>
  [...routes].sort((a, b) => {
    const pa = resolveName(String(a.providerId)) ?? String(a.providerId)
    const pb = resolveName(String(b.providerId)) ?? String(b.providerId)
    const byProvider = collator.compare(pa, pb)
    return byProvider !== 0
      ? byProvider
      : collator.compare(a.providerModel, b.providerModel)
  })

/** Sort by display name (fallback id). Same collator. Stable. */
export const sortProviderViews = <
  T extends { readonly name: string; readonly id: string },
>(
  views: readonly T[],
): readonly T[] =>
  [...views].sort(
    (a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id),
  )
