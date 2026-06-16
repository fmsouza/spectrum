# @spectrum/ipc

**Responsibility:** the typed GUI-main IPC contract + (de)serialization -- a zod schema per method, validated on receive in both directions, plus `createIpcClient`/`createIpcServer` over an injected transport.

**Public API (barrel `src/index.ts`):** `ProviderView` + `ProviderViewSchema`; the per-method `XParamsSchema`/`XResultSchema` + `IpcMethodSchemas` map + `IpcMethods`/`IpcMethodName` types; `IpcError`; `ClientTransport` + `createIpcClient` (+ `IpcClient`); `ServerTransport` + `IpcHandlers` + `createIpcServer` + `IpcRequestError`; `createMemoryTransportPair` (test fake).

**Depends on:** `@spectrum/types`, `@spectrum/utils`

**Effects owned:** none -- the message bus is an injected `ClientTransport`/`ServerTransport`; production wires Electrobun in `apps/desktop`, tests use `createMemoryTransportPair`.

**Local rules:** every payload has a zod schema validated on receive (both directions); the contract mirrors the CRUD list in the architecture doc. **Secrets never travel main→webview:** providers leave as `ProviderView` (presence flags, no `ref`/value). Inbound secret VALUES are accepted ONLY by `setProviderSecret`, `addProvider` (optional `secrets`), `testProviderDraft`, and `listProviderModelsDraft` — none of which echo a secret back. `void` results are encoded as `null`; errors are returned as `Result<T, IpcError>`, never thrown across the boundary.
