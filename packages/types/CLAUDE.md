# @launchkit/types

**Responsibility:** The four core domain types + zod schemas + branded ids.

**Public API (barrel `src/index.ts`):** SdkProviderSchema, ApiFormatSchema, ProviderIdSchema, ModelIdSchema, HarnessIdSchema, SessionIdSchema, SecretRefSchema, ProviderSchema, ModelRouteSchema, HarnessDefinitionSchema, SessionSchema, ProfileIdSchema, ProfileSchema, and their inferred TypeScript types.

**Depends on:** zod (external)

**Effects owned:** none

**Local rules:** Types are derived from zod schemas (`z.infer`); schema is the source of truth. Secrets are modeled as keychain references, never raw values.
