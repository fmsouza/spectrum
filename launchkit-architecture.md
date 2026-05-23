# LaunchKit — Architecture Plan

A Bun + Electrobun desktop app that works as both a CLI launcher (`launch claude --model deepseek`) and a GUI for managing providers, harnesses, routing, and session history.

---

## Key decisions upfront

**No LiteLLM.** LiteLLM is Python — it would require a bundled Python runtime, making distribution messy and the app feel foreign in the Bun ecosystem. You own the code, you control it, no subprocess management.

**Vercel AI SDK as the provider layer.** Supporting every LLM provider on the market isn't just about Anthropic and OpenAI-compatible endpoints. Gemini has its own wire format. Amazon Bedrock requires AWS SigV4 auth, not a plain API key. Vertex AI is a different surface from Gemini direct. Writing and maintaining raw HTTP adapters for all of these is essentially reimplementing LiteLLM in TypeScript — a full-time job as providers evolve. Instead, the proxy's provider layer is built on the [Vercel AI SDK](https://ai-sdk.dev) (`ai` package + `@ai-sdk/*` provider packages). It's TypeScript-native, runs on Bun, and ships first-class support for: OpenAI, Anthropic, Google Gemini, Google Vertex AI, Amazon Bedrock (incl. SigV4), Azure OpenAI, Mistral, Cohere, Groq, xAI, Together.ai, DeepSeek, Fireworks, Perplexity, Cerebras, and more — plus a community provider ecosystem. The proxy still handles Bun's HTTP server and the harness-facing wire format; the AI SDK handles everything on the provider side.

**One binary, two modes.** The Electrobun launcher binary detects how it was invoked. If `process.argv` contains subcommands (`launch`, `list`, `add`) it runs in CLI mode — no window, proxy starts ephemerally. Otherwise it opens the GUI and the proxy runs as a persistent background server for as long as the app is open.

**Proxy as the shared backbone.** Both modes talk through the same proxy server code. CLI mode starts it on demand; GUI mode keeps it alive. If the GUI is already running when you use the CLI, the CLI detects the proxy is up and reuses it — no double-start.

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        LaunchKit App                         │
│                                                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │   Main Process       │    │   WebKit Webview (GUI)   │   │
│  │   (Bun web worker)  │◄──►│                          │   │
│  │                     │IPC │  Providers   Harnesses   │   │
│  │  ┌───────────────┐  │    │  Routing     Sessions    │   │
│  │  │ Proxy Server  │  │    │  Settings    Tray menu   │   │
│  │  │ Bun.serve()   │  │    └──────────────────────────┘   │
│  │  │ :4000         │  │                                    │
│  │  └───────────────┘  │                                    │
│  │  ┌───────────────┐  │                                    │
│  │  │  Config Store │  │                                    │
│  │  │  (JSON file)  │  │                                    │
│  │  └───────────────┘  │                                    │
│  │  ┌───────────────┐  │                                    │
│  │  │Session Store  │  │                                    │
│  │  │ (Bun SQLite)  │  │                                    │
│  │  └───────────────┘  │                                    │
│  │  ┌───────────────┐  │                                    │
│  │  │Harness Manager│  │                                    │
│  │  │ (spawn/track) │  │                                    │
│  │  └───────────────┘  │                                    │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │                              │
  ┌──────┴──────┐              ┌────────┴────────┐
  │ CLI mode    │              │  Cloud providers │
  │             │              │                  │
  │ launch      │              │  Anthropic API   │
  │ codex       │              │  DeepSeek API    │
  │ claude      │              │  Gemini API      │
  │ opencode    │              │  Ollama local    │
  └─────────────┘              └─────────────────┘
```

---

## Core type system

Everything flows from four types. Keep these stable — they're the schema for config persistence, IPC messages, and the proxy's routing table.

```typescript
// Provider: an LLM API endpoint, backed by a Vercel AI SDK provider package
interface Provider {
  id: string
  name: string
  // Which @ai-sdk/* package handles this provider.
  // Each value maps to a specific createXxx() factory from the SDK.
  sdkProvider:
    | 'openai'       // @ai-sdk/openai   — also covers Groq, Together, DeepSeek, etc. (OpenAI-compat)
    | 'anthropic'    // @ai-sdk/anthropic
    | 'google'       // @ai-sdk/google          — Gemini (direct)
    | 'vertex'       // @ai-sdk/google-vertex   — Gemini via Vertex AI
    | 'bedrock'      // @ai-sdk/amazon-bedrock  — handles SigV4 auth automatically
    | 'azure'        // @ai-sdk/azure
    | 'mistral'      // @ai-sdk/mistral
    | 'cohere'       // @ai-sdk/cohere
    | 'groq'         // @ai-sdk/groq
    | 'xai'          // @ai-sdk/xai
    | 'fireworks'    // @ai-sdk/fireworks
    | 'perplexity'   // @ai-sdk/perplexity
    | 'cerebras'     // @ai-sdk/cerebras
    | 'ollama'       // community: ollama-ai-provider
  // Provider-specific config — shape varies by sdkProvider:
  //   openai/groq/etc: { apiKey }
  //   google/vertex:   { apiKey } or { project, location }
  //   bedrock:         { region, accessKeyId, secretAccessKey }
  //   azure:           { apiKey, resourceName, deploymentId }
  //   ollama:          { baseUrl }   (default: http://localhost:11434)
  config: Record<string, string>
  models: string[]   // known models for this provider, used in the picker UI
}

// ModelAlias: a stable name harnesses use, decoupled from the real provider model
interface ModelAlias {
  alias: string           // e.g. "default", "fast", "smart", "local"
  providerId: string
  providerModel: string   // what actually gets sent to the provider
}

// HarnessDefinition: how to launch a coding agent tool
interface HarnessDefinition {
  id: string
  name: string
  command: string                    // binary on PATH or absolute path
  apiFormat: 'anthropic' | 'openai' // what this harness expects to talk to
  envTemplate: Record<string, string> // e.g. { ANTHROPIC_BASE_URL: "{{proxyUrl}}" }
  defaultAlias: string
  description?: string
  builtIn: boolean                   // true = shipped with app, false = user-defined
}

// Session: one launched harness instance
interface Session {
  id: string
  harnessId: string
  alias: string             // which model alias was used
  startedAt: string
  endedAt?: string
  exitCode?: number
}
```

The `envTemplate` on `HarnessDefinition` uses simple `{{token}}` placeholders. At launch time the harness manager fills in `{{proxyUrl}}`, `{{proxyKey}}`, and `{{model}}`. This is how custom harnesses stay fully declarative — no code required to add one.

---

## Project structure

```
launchkit/
├── electrobun.config.ts        # build config: entrypoints, views, bundle settings
├── package.json
│
├── src/
│   ├── main.ts                 # entry point — detects GUI vs CLI, starts subsystems
│   │
│   ├── proxy/
│   │   ├── server.ts           # Bun.serve() — the HTTP proxy
│   │   ├── router.ts           # alias → provider lookup, calls factory + AI SDK
│   │   ├── adapters/
│   │   │   ├── anthropic.ts    # parse inbound Anthropic Messages API requests
│   │   │   └── openai.ts       # parse inbound OpenAI chat completions requests
│   │   └── providers/
│   │       └── factory.ts      # maps Provider.sdkProvider → AI SDK model instance
│   │                           # (createAnthropic, createGoogleGenerativeAI,
│   │                           #  createAmazonBedrock, createMistral, etc.)
│   │
│   ├── harnesses/
│   │   ├── registry.ts         # merges built-ins + user-defined at startup
│   │   ├── launcher.ts         # fills env template, spawns process, tracks PID
│   │   ├── builtin/
│   │   │   ├── claude.ts
│   │   │   ├── codex.ts
│   │   │   ├── opencode.ts
│   │   │   └── openclaw.ts
│   │   └── types.ts
│   │
│   ├── config/
│   │   ├── store.ts            # read/write ~/.config/launchkit/config.json
│   │   ├── defaults.ts         # factory defaults for first run
│   │   └── migrations.ts       # schema version upgrades
│   │
│   ├── sessions/
│   │   ├── store.ts            # Bun SQLite — create/close/query sessions
│   │   └── types.ts
│   │
│   ├── cli/
│   │   ├── index.ts            # argv parsing, command dispatch
│   │   └── commands/
│   │       ├── launch.ts       # launch <harness> [--model <alias>]
│   │       ├── list.ts         # list harnesses / providers / aliases
│   │       └── config.ts       # add / remove / show config items
│   │
│   └── gui/
│       ├── window.ts           # creates BrowserWindow, wires app menu
│       ├── tray.ts             # system tray — quick launch + status
│       └── ipc/
│           └── handlers.ts     # IPC handlers for all GUI↔main operations
│
└── views/
    └── main/
        ├── index.html
        ├── app.ts              # frontend entry, sets up router + IPC client
        └── pages/
            ├── dashboard.ts    # overview: active sessions, quick launch
            ├── providers.ts    # list, add, edit, delete providers
            ├── harnesses.ts    # list built-ins, add/edit custom harnesses
            ├── routing.ts      # alias table — alias → provider + model
            └── sessions.ts     # history, filter by harness/alias/date
```

---

## The proxy server

This is the critical path for performance. Keep it lean.

```
Request in (from harness)
  │
  ├── /v1/messages          → Anthropic Messages API format
  ├── /v1/chat/completions  → OpenAI chat completions format
  └── /v1/models            → return alias list (for model discovery)
          │
          ▼
     adapters/anthropic.ts or adapters/openai.ts
       parse the inbound request into a normalised internal format
       (messages[], system, maxTokens, stream, etc.)
          │
          ▼
     router.ts
       look up the requested model name in the alias table
       → resolve to (provider, providerModel)
          │
          ▼
     providers/factory.ts
       instantiate the right AI SDK provider using Provider.sdkProvider:
         createAnthropic({ apiKey })
         createGoogleGenerativeAI({ apiKey })
         createAmazonBedrock({ region, accessKeyId, secretAccessKey })
         createMistral({ apiKey })
         ... etc.
       call streamText(model, messages, ...) from 'ai'
          │
          ▼
     stream response back to harness
       in the wire format the harness expects (Anthropic or OpenAI SSE)
```

The key thing the AI SDK gives you here is that `streamText()` has a uniform call signature regardless of which provider is underneath. The factory returns a model object; everything from there is identical code. You never write provider-specific streaming logic — the SDK handles SSE, chunked responses, and auth per provider.

The inbound adapters (Anthropic/OpenAI format parsing) still exist because harnesses speak fixed formats. The outbound side — everything from factory.ts onward — is entirely the SDK's responsibility.

The proxy binds to `localhost:4000` by default (configurable). It only ever listens on loopback — no network exposure.

---

## Dual-mode entry point

`src/main.ts` is the single entry point for both modes:

```typescript
import { app } from 'electrobun/bun'
import { startProxy } from './proxy/server'
import { parseArgs } from './cli'
import { openGuiWindow } from './gui/window'
import { isProxyRunning } from './proxy/server'

const isCLI = process.argv.length > 2 &&
  ['launch', 'list', 'add', 'remove'].includes(process.argv[2])

if (isCLI) {
  // CLI mode: start proxy only if not already up, run command, exit
  if (!await isProxyRunning()) {
    startProxy()
  }
  await parseArgs(process.argv.slice(2))
  process.exit(0)
} else {
  // GUI mode: start proxy, open window, keep running
  startProxy()
  openGuiWindow()
}
```

`isProxyRunning()` is a single `fetch('http://localhost:4000/health')` with a short timeout. If the GUI is open, the proxy answers. The CLI reuses it without starting a duplicate.

---

## Harness extensibility

Built-in harnesses are TypeScript objects in `harnesses/builtin/`. Here's what one looks like:

```typescript
// harnesses/builtin/claude.ts
import type { HarnessDefinition } from '../types'

export const claudeHarness: HarnessDefinition = {
  id: 'claude',
  name: 'Claude Code',
  command: 'claude',
  apiFormat: 'anthropic',
  envTemplate: {
    ANTHROPIC_BASE_URL: '{{proxyUrl}}',
    ANTHROPIC_API_KEY:  '{{proxyKey}}',
    ANTHROPIC_MODEL:    '{{model}}',
  },
  defaultAlias: 'default',
  builtIn: true,
}
```

User-defined harnesses use the exact same shape, stored as JSON files in `~/.config/launchkit/harnesses/`. The registry merges both at startup. Adding a custom harness in the GUI = filling a form that writes one of these files. No code, no restart required (the registry hot-reloads from disk).

To add support for a brand new harness the user has never heard of: drop a JSON file in that folder, or use the GUI form. If the harness binary is on PATH and speaks either Anthropic or OpenAI format, it works immediately.

---

## GUI: IPC contract

The GUI talks to the main process over Electrobun's IPC. Keep the contract narrow — it should read like a simple CRUD API.

```
// Providers
getProviders()            → Provider[]
addProvider(p)            → Provider
updateProvider(id, p)     → Provider
deleteProvider(id)        → void
testProvider(id)          → { ok: boolean, latencyMs: number }

// Aliases
getAliases()              → ModelAlias[]
addAlias(a)               → ModelAlias
updateAlias(id, a)        → ModelAlias
deleteAlias(id)           → void

// Harnesses
getHarnesses()            → HarnessDefinition[]
addHarness(h)             → HarnessDefinition   // custom only
updateHarness(id, h)      → HarnessDefinition   // custom only
deleteHarness(id)         → void                // custom only

// Launch
launchHarness(id, alias?) → Session

// Sessions
getSessions(filters?)     → Session[]

// Proxy
getProxyStatus()          → { running: boolean, port: number }
```

Each handler in `gui/ipc/handlers.ts` maps to one of these, calling into the relevant subsystem (config store, harness manager, session store).

---

## System tray

The tray is the quick-access surface when the window is closed. It shows:

- A dot indicator: green = proxy running, grey = stopped
- A "Launch" submenu auto-generated from the harness registry, each item triggering `launchHarness(id)` with the default alias
- "Open LaunchKit" to bring up the main window
- "Quit"

This means even when the GUI window is closed, you can launch a harness from the menu bar in one click — staying close to the `ollama launch` UX.

---

## Config persistence

All config lives in `~/.config/launchkit/`:

```
~/.config/launchkit/
  config.json          # providers, aliases, settings
  harnesses/           # one .json file per custom harness definition
  launchkit.db         # SQLite for session history
```

`config.json` has a `version` field. `migrations.ts` runs on startup and upgrades the schema forward if needed. Config writes are atomic (write to `.tmp`, then rename).

API keys in `config.json` are stored as-is for now. For a future hardening pass, the macOS Keychain can store them instead — but that's not necessary to make this work.

---

## Build phases

### Phase 1 — CLI core (no GUI, no Electrobun yet)

Get the fundamentals working as a plain Bun script first.

1. Config store (read/write `config.json`)
2. Proxy server (Bun.serve, three endpoints: `/v1/messages`, `/v1/chat/completions`, `/v1/models`)
3. Inbound adapters — parse Anthropic and OpenAI request formats into a normalised internal shape
4. Provider factory (`providers/factory.ts`) — maps `Provider.sdkProvider` to the right `@ai-sdk/*` instance; call `streamText()` uniformly across all providers
5. Outbound serialiser — convert the AI SDK stream back to the wire format the harness expects (Anthropic SSE or OpenAI SSE)
6. Harness registry (built-ins: claude, codex, opencode, openclaw)
7. Harness launcher (fill env template, spawn, track PID)
8. CLI entry point (`launch`, `list`, `add provider`, `add alias`)

At the end of Phase 1 you have a working `bun run src/main.ts launch claude --model deepseek` with the same UX as the shell script, but config-driven and supporting every provider the AI SDK covers — which is essentially the entire market.

### Phase 2 — Electrobun shell + basic GUI

Wrap the Phase 1 core in Electrobun.

9. Wire `src/main.ts` as the Electrobun entry point with dual-mode detection
10. `gui/window.ts` — create the BrowserWindow
11. `gui/ipc/handlers.ts` — expose the CRUD contract above
12. Basic views: Providers page (with `sdkProvider` picker + per-provider config form), Aliases/Routing page, Harnesses page (list + add form)
13. System tray with quick-launch submenu

### Phase 3 — Sessions + polish

14. SQLite session store (Bun's `bun:sqlite`)
15. Sessions history view
16. Dashboard (active sessions, recent launches, quick-launch cards)
17. Config import/export
18. Provider connectivity test — call `streamText()` with a trivial prompt and report latency; works uniformly across all providers via the SDK

---

## What this intentionally leaves out

- **Bundled Ollama or any other binary** — users bring their own installations. LaunchKit only manages config and routing.
- **Chat UI** — harnesses run in their own terminal windows. LaunchKit tracks sessions but doesn't try to render conversation history; each harness owns that.
- **Authentication/multi-user** — this is a single-user local tool.
- **Auto-update** — Electrobun's updater can be wired in later, but it's not needed to ship.

These can all be added later without touching the core architecture.
