# @spectrum/proxy

**Responsibility:** HTTP proxy + inbound adapters + router + AI SDK provider factory + outbound serializers.

**Public API (barrel `src/index.ts`):** startProxy, isProxyRunning, createHandler, createRouter, createProviderFactory, loadSdk, createRealGateway, the adapters, validateProviderConfig, and all public types.

**Depends on:** @spectrum/types, @spectrum/utils, @spectrum/config, @spectrum/secrets

**Effects owned:** http server + outbound network (AI SDK)
— exposed to consumers as injected interfaces; never reached around.

**Local rules:** stream, never buffer; cache provider instances; loopback-only + key-checked; streamText() is the uniform call.
