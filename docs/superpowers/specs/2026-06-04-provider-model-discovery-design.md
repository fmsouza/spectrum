# Live provider model discovery (Routing model picker) — design

**Date:** 2026-06-04
**Status:** approved (brainstorm) → ready for implementation plan

## 1. Problem & goal

The Routing (alias) form's **Model** field is a free-text input. Users must know and type exact
model ids. It should be a **picker of the models the selected provider actually serves**.

Constraint discovered: `ProviderView` carries a `models: string[]`, but the GUI's Add-Provider form
hardcodes `models: []`, so no provider has a stored model list (the user's `ollama` provider has
`models: []`). Therefore the picker must be fed by **live discovery** — query the provider for the
models it serves — not by the (empty) stored list.

## 2. Approach (decided)

Live discovery: when a provider is selected in the Routing form, query that provider for its
available models and populate the Model field as a `<Select>`. Fall back to a free-text input when
discovery is unsupported, errors, or returns nothing (so the user is never re-blocked).

## 3. Scope

**In:** ollama + OpenAI-compatible discovery; a new `listProviderModels` IPC method + backend
lister + desktop wiring; the RoutingPage Model field becoming a discovered-models picker with a
free-text fallback; auto-fetch on provider selection. TDD throughout.

**Out (documented):** discovery for anthropic / google / vertex / bedrock / azure (they fall back to
free-text — anthropic needs different auth/headers; easy to add later); a "fetch models" button
(auto-fetch instead); populating/persisting a provider's stored `models` list; model discovery in
the CLI.

## 4. Backend — `@launchkit/proxy` model lister

A new `createModelLister` mirroring `createProviderTester` (`packages/proxy/src/provider-tester.ts`):
effects (HTTP) behind an injected fetcher with a fake for tests; returns `Result<string[], ProxyError>`.

```ts
// packages/proxy/src/model-lister.ts
export type ModelLister = (input: {
  sdkProvider: SdkProvider
  config: Record<string, string>   // non-secret config incl. baseURL
  apiKey?: string                  // resolved secret (absent for keyless providers like ollama)
}) => Promise<Result<readonly string[], ProxyError>>

export const createModelLister = (deps: { httpGet: HttpGet }): ModelLister => { ... }
```

Per-SDK behavior (classified by `sdkProvider`):
- **ollama** → `GET {baseURL ?? "http://localhost:11434"}/api/tags` → map `.models[].name` (string[]).
  No auth.
- **OpenAI-compatible** (`openai`, `groq`, `xai`, `fireworks`, `perplexity`, `cerebras`, `mistral`,
  `cohere`) → `GET {baseURL ?? <sdk default>}/v1/models` with `Authorization: Bearer {apiKey}` →
  map `.data[].id`.
- **others** (`anthropic`, `google`, `vertex`, `bedrock`, `azure`) → return
  `err({ kind: "unsupported-model-discovery", ... })` (or an equivalent existing `ProxyError` kind) so
  the UI falls back to free-text.

`HttpGet` is a minimal injected interface (`(url, headers?) => Promise<Result<unknown, ProxyError>>`,
real = `fetch` + JSON parse; fake returns canned bodies). Parse defensively (validate the JSON shape;
malformed → `err`). The base URL comes from `config` (e.g. `config.baseURL`/`config.baseUrl` — match
how the provider factory reads it); fall back to each SDK's public default.

## 5. IPC — `@launchkit/ipc`

New method `listProviderModels`:
- params: `z.object({ providerId: ProviderIdSchema }).strict()`
- result: `z.object({ models: z.array(z.string()) }).strict()`

A successful-but-empty result (`{ models: [] }`) means "none found"; discovery errors (unsupported,
network, auth, malformed) surface as an `IpcError` (the UI handles both → free-text fallback).

## 6. Desktop — handler + composition

- `apps/desktop/src/composition.ts`: add `ctx.listProviderModels(providerId)` mirroring
  `createTestProvider` (composition.ts:228–239, 392): look up the provider in config, resolve its
  apiKey from the keychain (secret store) like the tester, call the proxy `ModelLister`, return the
  models. SECURITY: only the provider's resolved key is used internally; never returned to the view.
- `apps/desktop/src/gui/ipc/handlers.ts`: `listProviderModels({ providerId })` handler →
  `ctx.listProviderModels(providerId)` → `{ models }`. Errors propagate as handler failures.
- `apps/desktop/views/main/test/fake-client.ts`: add `listProviderModels` to the method list.

## 7. UI — RoutingPage Model field

`apps/desktop/views/main/pages/RoutingPage.tsx` (data-aware page). The alias draft has `providerId`
+ `providerModel`. Add model discovery at the page level:
- A `useProviderModels(providerId)` hook (or inline page state) that calls
  `client.listProviderModels({ providerId })` whenever a non-empty `providerId` is selected
  (auto-fetch; re-fetch on change). Exposes `{ models, loading, error }`.
- The **Model** field renders:
  - while loading → a disabled select / spinner;
  - on success with models → a `<Select>` of the discovered models (this is the primary case);
  - on empty or error (incl. unsupported SDKs) → the existing free-text `<TextInput>` plus a short
    note (e.g. "Couldn't list models for this provider — enter one manually.") so the user can still
    type a model id.
- Selecting a provider clears/!revalidates the chosen `providerModel` if it's no longer valid.
- The create-alias flow (validation, `addAlias`) is otherwise unchanged; `providerModel` still feeds
  `ModelAlias.providerModel`.

Dumb UI components stay pure: discovery is fetched at the page level and the model options are passed
to the form controls as props/state.

## 8. Testing (TDD)

- **proxy:** `createModelLister` — ollama `/api/tags` parse, OpenAI `/v1/models` parse (with Bearer),
  unsupported-SDK → err, network/malformed → err; all via the fake `HttpGet`.
- **ipc:** `listProviderModels` schema parse + client↔server round-trip on the memory transport.
- **desktop:** the `listProviderModels` handler over a fake `ctx.listProviderModels`; composition
  wiring resolves the secret + calls the lister (fake).
- **ui:** RoutingPage — auto-fetches on provider select; renders a `<Select>` of discovered models;
  falls back to free-text (with the note) on empty/error; created alias carries the chosen model.

## 9. Risks / notes

- **Network at the boundary only:** discovery lives behind the injected `HttpGet`; tests never hit the
  network; the real adapter is constructed in composition.
- **Secrets:** the apiKey is resolved server-side (keychain) and used only for the outbound request;
  never crosses to the view (consistent with the `ProviderView` secret-free rule).
- **Eyes-on:** the live ollama/OpenAI round-trip is a manual-verification item (automated tests use
  the fake fetcher) — add it to `apps/desktop/MANUAL-VERIFICATION.md`.
