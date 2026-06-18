# Releasing & macOS signing

macOS channel builds (`build:stable` / `build:canary`) are code-signed with a
Developer ID Application certificate and notarized + stapled by Apple. Signing
is enforced in CI — if the secrets below are missing or signing/notarization
fails, the `release.yml` / `canary.yml` macOS jobs hard-fail (they never ship an
unsigned app). Local dev builds (`bun run start`/`dev`/`build`) skip signing and
need no credentials.

## Required GitHub Actions secrets

Set these in the repository settings (Settings → Secrets and variables →
Actions). They are consumed by the `.github/actions/macos-codesign-setup`
composite action.

| Secret | How to produce it |
|--------|-------------------|
| `MACOS_CERTIFICATE_P12_BASE64` | Export the "Developer ID Application" cert **with its private key** from Keychain Access as `cert.p12`, then `base64 -i cert.p12 \| pbcopy`. |
| `MACOS_CERTIFICATE_PASSWORD` | The export password you set when creating the `.p12`. |
| `MACOS_SIGN_IDENTITY` | The identity string, e.g. `Developer ID Application: Your Name (TEAMID)`. Find it with `security find-identity -v -p codesigning`. |
| `MACOS_KEYCHAIN_PASSWORD` | Any throwaway value (e.g. `openssl rand -hex 16`); used only for the ephemeral CI keychain. |
| `APPLE_API_KEY_P8_BASE64` | App Store Connect → Users and Access → Integrations → Keys → create a key with the "Developer" role; download `AuthKey_XXXX.p8`, then `base64 -i AuthKey_XXXX.p8 \| pbcopy`. |
| `APPLE_API_KEY_ID` | The Key ID shown next to the key (the `XXXX` in the filename). |
| `APPLE_API_ISSUER_ID` | The Issuer ID shown at the top of the Keys page. |

## How CI uses them

1. `macos-codesign-setup` imports the cert into a temporary keychain and writes
   the `.p8` to `$RUNNER_TEMP`, exporting `ELECTROBUN_DEVELOPER_ID` and the
   `ELECTROBUN_APPLEAPI*` env vars Electrobun reads.
2. `electrobun build --env=<channel>` signs the app bundle + self-extracting
   bundle + `.dmg`, then notarizes and staples each.
3. A verify gate mounts the `.dmg` and asserts `codesign --verify`,
   `spctl` "Notarized Developer ID", and `stapler validate` all pass.

## Released artifacts

Each versioned release ships, per platform: one OS installer (macOS `.dmg`,
Linux `*-Setup.tar.gz`, Windows `*-Setup.exe.zip`) + one CLI archive, plus a
single `checksums-sha256.txt`. The auto-update feed (`*-update.json`, `*.patch`,
`*.tar.zst`) is published separately to the rolling `updates` tag.
