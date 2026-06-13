import { SdkProviderSchema } from "@spectrum/types"
import { type Result, err, ok } from "@spectrum/utils"
import { getDescriptor } from "./catalog"
import type { ProviderConfigError } from "./types"

/**
 * Validate a provider's NON-secret config against its descriptor's schema.
 * Unknown providers yield `unsupported-provider`; schema failures yield `bad-request`.
 */
export const validateProviderConfig = (
  sdkProvider: string,
  config: unknown,
): Result<void, ProviderConfigError> => {
  const key = SdkProviderSchema.safeParse(sdkProvider)
  if (!key.success) return err({ kind: "unsupported-provider", sdkProvider })
  const schema = getDescriptor(key.data).configSchema
  const parsed = schema.safeParse(config)
  if (!parsed.success)
    return err({ kind: "bad-request", detail: parsed.error.message })
  return ok(undefined)
}
