import { type HarnessDefinition, HarnessIdSchema } from "@launchkit/types"

/**
 * OpenClaw is a delegating GATEWAY daemon (`openclaw gateway start`), not a Claude-style CLI. It reads
 * its provider/model config from `~/.openclaw/openclaw.json` (`models.providers`) and does NOT honor
 * `ANTHROPIC_BASE_URL` — so the old proxy-env launch was a no-op. The native `@launchkit/driver-openclaw`
 * driver RE-ARCHITECTS the launch: it connects to the running Gateway over the App SDK / Gateway WS
 * protocol (NOT the proxy). This definition therefore renders NO proxy env; it only carries the gateway
 * connection config the driver reads (url/token/agent/model). Provider routing through the LaunchKit proxy,
 * if desired, is configured by the user in `~/.openclaw/openclaw.json` (point a `models.providers.<id>.baseUrl`
 * at the proxy) — out of scope for the harness definition.
 *
 * UNVERIFIED: no openclaw binary in this environment; the gateway transport is documented-protocol-correct
 * but not app-run-verified.
 */
export const openclaw: HarnessDefinition = {
  id: HarnessIdSchema.parse("openclaw"),
  name: "OpenClaw",
  command: "openclaw",
  apiFormat: "anthropic",
  description:
    "OpenClaw gateway (native driver, UNVERIFIED). Connects to the running OpenClaw Gateway; provider config lives in ~/.openclaw/openclaw.json.",
  // Gateway connection config consumed by @launchkit/driver-openclaw's adapter. These are literal
  // defaults (no proxy tokens): the driver reads OPENCLAW_GATEWAY_URL/_TOKEN/_AGENT_ID/_MODEL from the
  // launch env. The token is intentionally empty here — a real token is supplied by the user's gateway
  // setup / launch env, never a LaunchKit proxy key.
  envTemplate: {
    OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
    OPENCLAW_AGENT_ID: "default",
  },
  builtIn: true,
} satisfies HarnessDefinition
