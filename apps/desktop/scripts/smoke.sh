#!/usr/bin/env bash
# Build the dev .app, launch it, prove the proxy binds on loopback, then clean up.
# Exits non-zero on any failure. macOS only.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${LK_PORT:-4000}"
APP="build/dev-macos-arm64/LaunchKit-dev.app"

echo "==> building"
bunx electrobun build

echo "==> verifying launcher entrypoint exists (bun/index.js)"
test -f "$APP/Contents/Resources/app/bun/index.js" \
  || { echo "FAIL: bundle is missing bun/index.js — launcher will load nothing"; exit 1; }

echo "==> verifying the built app.css contains the app theme (not just xterm)"
CSS="$APP/Contents/Resources/app/views/main/app.css"
grep -q ":root" "$CSS" && grep -q "nav\[aria-label" "$CSS" \
  || { echo "FAIL: built app.css is missing the app theme (xterm CSS likely clobbered it)"; exit 1; }

echo "==> verifying app.css matches the rail+master+detail shell (post-redesign)"
# Guards against the CSS desyncing from the AppShell DOM again (the unstyled
# master/detail regression): the 3-zone grid needs the master-column token, the
# Sessions master nav, and the sessions-detail terminal container.
grep -q -- "--master-w" "$CSS" \
  && grep -q 'nav\[aria-label="Sessions"\]' "$CSS" \
  && grep -q "\.sessions-detail" "$CSS" \
  || { echo "FAIL: built app.css is out of sync with the rail+master+detail shell"; exit 1; }

echo "==> launching app"
open "$APP"
trap 'pkill -f "LaunchKit-dev" 2>/dev/null || true' EXIT

echo "==> waiting for proxy /health on 127.0.0.1:$PORT"
ok=""
for _ in $(seq 1 20); do
  if curl -fsS -m 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
test -n "$ok" || { echo "FAIL: proxy never bound on 127.0.0.1:$PORT after launch"; exit 1; }

echo "==> asserting loopback-only binding (never 0.0.0.0/*)"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -q "127.0.0.1:$PORT" \
  || { echo "FAIL: proxy not bound to loopback"; exit 1; }
! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | grep -qE "\*:$PORT|0\.0\.0\.0:$PORT" \
  || { echo "FAIL: proxy bound to a public interface"; exit 1; }

echo "PASS: app launches, proxy bound to loopback, /health ok"
