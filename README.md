# LaunchKit

LaunchKit is a dual-mode (CLI + GUI) desktop app that lets coding-agent harnesses
(Claude Code, Codex, opencode, openclaw, …) talk to any LLM provider. It runs a small
proxy on loopback that receives requests in the Anthropic or OpenAI wire format, resolves
a model **alias** to a concrete provider + model, and streams the response back via the
[Vercel AI SDK](https://sdk.vercel.ai). You manage providers, API keys, routing aliases,
and session history from the GUI; the CLI launches harnesses and edits config from the
terminal.

## Requirements

- **macOS on Apple Silicon** — the build target is `dev-macos-arm64`.
- **Bun ≥ 1.3.14** (the repo pins `bun@1.3.14`). Install from <https://bun.sh>.

Bootstrap the workspace once:

```sh
bun install
```

## Build & run the GUI app

```sh
cd apps/desktop && bunx electrobun build
```

This produces an unsigned development bundle at:

```
apps/desktop/build/dev-macos-arm64/LaunchKit-dev.app
```

(The first build may download Electrobun core binaries.)

Install or run it:

```sh
# run in place
open apps/desktop/build/dev-macos-arm64/LaunchKit-dev.app

# or install it
cp -R apps/desktop/build/dev-macos-arm64/LaunchKit-dev.app /Applications/
```

Because the build is **unsigned**, macOS Gatekeeper may block the first launch. Either
right-click the app → **Open** (then confirm), or strip the quarantine attribute:

```sh
xattr -dr com.apple.quarantine apps/desktop/build/dev-macos-arm64/LaunchKit-dev.app
```

On launch the GUI starts a loopback proxy on `127.0.0.1:4000` and adds a menu-bar tray
icon (launch a harness or quit from there).

## Build & use the CLI

Compile the standalone CLI binary from the repo root:

```sh
bun run --filter launchkit compile
```

This outputs a self-contained executable at `apps/desktop/dist/launchkit-cli`.

The command surface:

```sh
# list what's configured
./apps/desktop/dist/launchkit-cli list harnesses
./apps/desktop/dist/launchkit-cli list providers
./apps/desktop/dist/launchkit-cli list models

# launch a harness (uses its default model unless --model overrides)
./apps/desktop/dist/launchkit-cli launch claude
./apps/desktop/dist/launchkit-cli launch claude --model fast

# add / remove a provider (secrets are NOT set here — see "Configure providers")
./apps/desktop/dist/launchkit-cli add provider --id openai --name OpenAI --sdk openai
./apps/desktop/dist/launchkit-cli remove provider openai

# add / remove a model
./apps/desktop/dist/launchkit-cli add model --name fast --provider openai --model gpt-4o-mini
./apps/desktop/dist/launchkit-cli remove model fast
```

`launch` ensures a proxy is up: it reuses a proxy already running on `127.0.0.1:4000`
(e.g. one started by the GUI), otherwise it starts an ephemeral one with a freshly
generated per-run key.

## Configure providers

Provider API keys are added from the GUI **Providers** page, never from the CLI. Keys are
stored in the **macOS Keychain** — `~/.config/launchkit/config.json` holds only a
reference to each key, never the value. (`launchkit add provider` creates a provider with
empty secrets; you then set the key in the GUI.)

Map your model **aliases** (`default`, `fast`, `smart`, `local`) to a provider + model on
the GUI **Models** page. Harnesses request an alias, and the proxy routes it to the
configured provider/model. The "default" option bypasses the proxy entirely and launches
the harness with its own native credentials/model.

## Development

Run the full gate from the repo root before committing:

```sh
bun run typecheck && bun run lint && bun test
```

`bun test` alone runs the test suite. For an end-to-end runtime check (builds the app,
launches it, probes `/health` on loopback, then cleans up):

```sh
bash apps/desktop/scripts/smoke.sh
```

For the GUI-specific smoke checklist that can't be automated (window, tray, native
folder dialog, live xterm round-trip), see
[`apps/desktop/MANUAL-VERIFICATION.md`](apps/desktop/MANUAL-VERIFICATION.md).

## Project layout

- `packages/*` — the functional backend: `proxy`, `harnesses`, `config`, `secrets`,
  `sessions`, `cli`, `ipc`, `pty`, `ui`, `types`, `utils`.
- `apps/desktop` — the Electrobun shell (window, tray, IPC) + the React UI; the one place
  real effects (fs, keychain, sqlite, process, server) are constructed and injected.
- `tooling/` — shared config presets (Biome, tsconfig).

## Contributing / extending

The rulebook for any agent working in this repo is the **root `CLAUDE.md`** — it
covers TypeScript style, functional layering, TDD, atomic design for the React UI,
security, performance, and package boundaries. For per-package context (responsibility,
public API, owned effects, local invariants), read that package's `CLAUDE.md` (every
package and `apps/desktop` has one).

Workflow skills live under `.claude/skills/` and cover recurring LaunchKit-specific
tasks:

| Skill | When to use it |
|---|---|
| `launchkit-new-package` | Creating a new internal package under `packages/` |

All other process (TDD, planning, review, debugging) is covered by the superpowers
skills — invoke `using-superpowers` at the start of a session.
