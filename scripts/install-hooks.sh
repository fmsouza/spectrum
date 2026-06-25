#!/usr/bin/env bash
# Install the project's git hooks by pointing `core.hooksPath` at
# `scripts/hooks/`. Idempotent: safe to run on every `bun install` via the
# `prepare` script in the root package.json.
#
# The hooks live in the tracked repo (not in .git/hooks) so they can be
# reviewed in PRs and updated alongside the code they enforce.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/scripts/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "error: hooks directory not found: $HOOKS_DIR" >&2
  exit 1
fi

# Ensure the hook script is executable.
chmod +x "$HOOKS_DIR/commit-msg"

# Point git at the hooks directory. Idempotent — git treats re-setting as a no-op
# when the value is unchanged, but writes the config either way.
git config core.hooksPath "$HOOKS_DIR"

echo "installed git hooks from $HOOKS_DIR"
