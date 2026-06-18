#!/usr/bin/env bash
#
# check-macos-signing.sh — validate macOS code-signing + notarization credentials locally,
# BEFORE wiring them into GitHub Secrets. Exercises the same material the CI uses:
#   • imports the Developer ID cert into a throwaway keychain
#   • confirms the signing identity is present and can actually sign (Developer ID authority)
#   • confirms the App Store Connect API key can talk to Apple's notary service
#
# It is fully isolated: it creates a temporary keychain, signs a throwaway copy of a system
# binary using `codesign --keychain`, and never modifies your login keychain, default keychain,
# or search list. Everything is removed on exit.
#
# Usage:
#   scripts/check-macos-signing.sh [path/to/env-file]
#
# Provide the values via environment variables (or an env file passed as $1 that this script
# `source`s — e.g. a gitignored `.env.signing`). Names mirror the GitHub Secrets:
#
#   MACOS_SIGN_IDENTITY          "Developer ID Application: Your Name (TEAMID)"
#   MACOS_CERTIFICATE_PASSWORD   export password you set on the .p12
#   APPLE_API_KEY_ID             App Store Connect API key id
#   APPLE_API_ISSUER_ID          App Store Connect API issuer UUID
#
#   # the certificate — provide EITHER a file path (convenient locally) OR base64 (as in CI):
#   MACOS_CERTIFICATE_P12_PATH   path to the exported .p12          (preferred locally)
#   MACOS_CERTIFICATE_P12_BASE64 base64 of the .p12                 (what the GitHub Secret holds)
#
#   # the API key — likewise EITHER a path OR base64:
#   APPLE_API_KEY_P8_PATH        path to AuthKey_XXXX.p8            (preferred locally)
#   APPLE_API_KEY_P8_BASE64      base64 of the .p8                  (what the GitHub Secret holds)
#
#   MACOS_KEYCHAIN_PASSWORD      optional; a throwaway temp-keychain password (auto-generated if unset)
#
set -euo pipefail

# ── platform guard ────────────────────────────────────────────────────────────
if [ "$(uname)" != "Darwin" ]; then
  echo "✗ This check only runs on macOS (signing/notarization are macOS-only)." >&2
  exit 1
fi

# ── load env file if provided ───────────────────────────────────────────────────
if [ "${1:-}" != "" ]; then
  if [ ! -f "$1" ]; then echo "✗ env file not found: $1" >&2; exit 1; fi
  # shellcheck disable=SC1090
  set -a; source "$1"; set +a
  echo "• Loaded credentials from $1"
fi

fail=0
note() { printf '  %s\n' "$1"; }
ok()   { printf '✓ %s\n' "$1"; }
bad()  { printf '✗ %s\n' "$1" >&2; fail=1; }

# ── required scalar inputs ────────────────────────────────────────────────────
required_scalars=(MACOS_SIGN_IDENTITY MACOS_CERTIFICATE_PASSWORD APPLE_API_KEY_ID APPLE_API_ISSUER_ID)
missing=()
for v in "${required_scalars[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing required variables: ${missing[*]}" >&2
  echo "  See the header of this script (or docs/RELEASING.md) for how to obtain each." >&2
  exit 1
fi

# ── workspace + cleanup trap ──────────────────────────────────────────────────
WORK="$(mktemp -d)"
KEYCHAIN="$WORK/spectrum-signing-check.keychain-db"
KEYCHAIN_PASSWORD="${MACOS_KEYCHAIN_PASSWORD:-$(openssl rand -hex 16)}"
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# ── materialize the .p12 (from path or base64) ────────────────────────────────
CERT_P12="$WORK/cert.p12"
if [ -n "${MACOS_CERTIFICATE_P12_PATH:-}" ]; then
  cp "$MACOS_CERTIFICATE_P12_PATH" "$CERT_P12"
elif [ -n "${MACOS_CERTIFICATE_P12_BASE64:-}" ]; then
  printf '%s' "$MACOS_CERTIFICATE_P12_BASE64" | base64 --decode > "$CERT_P12"
else
  echo "✗ Provide the certificate via MACOS_CERTIFICATE_P12_PATH or MACOS_CERTIFICATE_P12_BASE64." >&2
  exit 1
fi

# ── materialize the .p8 (from path or base64) ─────────────────────────────────
API_KEY_P8="$WORK/key.p8"
if [ -n "${APPLE_API_KEY_P8_PATH:-}" ]; then
  cp "$APPLE_API_KEY_P8_PATH" "$API_KEY_P8"
elif [ -n "${APPLE_API_KEY_P8_BASE64:-}" ]; then
  printf '%s' "$APPLE_API_KEY_P8_BASE64" | base64 --decode > "$API_KEY_P8"
else
  echo "✗ Provide the API key via APPLE_API_KEY_P8_PATH or APPLE_API_KEY_P8_BASE64." >&2
  exit 1
fi

echo
echo "── 1/4  Importing the certificate into a throwaway keychain ──────────────────"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
if security import "$CERT_P12" -P "$MACOS_CERTIFICATE_PASSWORD" \
     -t cert -f pkcs12 -k "$KEYCHAIN" -T /usr/bin/codesign 2>"$WORK/import.err"; then
  ok "Certificate imported (the .p12 password is correct)."
else
  bad "Could not import the .p12 — wrong MACOS_CERTIFICATE_PASSWORD or a malformed/incomplete export."
  note "$(sed 's/^/    /' "$WORK/import.err")"
  exit 1
fi
security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null 2>&1 || true

echo
echo "── 2/4  Confirming the signing identity is present ───────────────────────────"
IDENTITIES="$(security find-identity -v -p codesigning "$KEYCHAIN" || true)"
note "$(printf '%s' "$IDENTITIES" | sed 's/^/    /')"
if printf '%s' "$IDENTITIES" | grep -Fq "$MACOS_SIGN_IDENTITY"; then
  ok "Found identity matching MACOS_SIGN_IDENTITY."
else
  bad "MACOS_SIGN_IDENTITY not found in the imported certificate."
  note "Set MACOS_SIGN_IDENTITY to the exact quoted name shown above"
  note "(e.g. 'Developer ID Application: Your Name (TEAMID)')."
fi

echo
echo "── 3/4  Test-signing a throwaway binary with the Developer ID identity ───────"
cat > "$WORK/entitlements.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
PLIST
TESTBIN="$WORK/testbin"
cp /usr/bin/true "$TESTBIN"
if codesign --force --timestamp --options runtime \
     --entitlements "$WORK/entitlements.plist" \
     --keychain "$KEYCHAIN" \
     --sign "$MACOS_SIGN_IDENTITY" "$TESTBIN" 2>"$WORK/sign.err"; then
  AUTH="$(codesign -dvvv "$TESTBIN" 2>&1 | grep -E '^Authority=' | head -1 || true)"
  if codesign --verify --strict --verbose=2 "$TESTBIN" 2>/dev/null \
       && printf '%s' "$AUTH" | grep -q "Developer ID Application"; then
    ok "Signed + verified with a Developer ID Application identity."
    note "${AUTH}"
  else
    bad "Signed, but verification/authority check failed (not a Developer ID signature?)."
    note "${AUTH:-<no authority line>}"
  fi
else
  bad "codesign failed — the identity cannot sign (timestamp server unreachable, or wrong cert type)."
  note "$(sed 's/^/    /' "$WORK/sign.err")"
fi

echo
echo "── 4/4  Validating notarization credentials with Apple ───────────────────────"
if xcrun notarytool history \
     --key "$API_KEY_P8" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID" \
     >"$WORK/notary.out" 2>"$WORK/notary.err"; then
  ok "App Store Connect API key authenticated (notarytool reached Apple)."
  note "$(grep -E 'createdDate|id:|status:' "$WORK/notary.out" | head -3 | sed 's/^/    /' || true)"
else
  bad "notarytool could not authenticate — check APPLE_API_KEY_ID / APPLE_API_ISSUER_ID / the .p8."
  note "$(sed 's/^/    /' "$WORK/notary.err")"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "✅ All signing + notarization credentials look good — safe to set these as GitHub Secrets."
  exit 0
else
  echo "❌ One or more checks failed (see above). Fix locally before configuring GitHub Secrets." >&2
  exit 1
fi
