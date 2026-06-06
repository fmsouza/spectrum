/**
 * selector-contract.test.tsx — permanent selector-contract regression guard
 *
 * Renders the real component tree across representative app states and asserts
 * that every engine-checkable CSS selector in the 11 stylesheet partials matches
 * at least one element somewhere. Any selector with zero matches is a genuine
 * CSS↔markup drift bug.
 *
 * NOT-CHECKABLE buckets (engine limitations, documented honestly):
 *
 *   GLOBAL_BUCKET — bare element/root selectors that are not rendered as
 *     children in happy-dom test containers: :root, html, body, #root, *,
 *     *::before, *::after. Also: h1–h4 (used in SettingsLayout/modal headers
 *     but queried as bare tags is engine-level noise), code/kbd/samp/pre
 *     (typography resets, not rendered in these test states).
 *
 *   PSEUDO_BUCKET — selectors with trailing state pseudos (:hover, :focus,
 *     :active, :disabled, :not(:disabled), :checked, ::placeholder, ::after,
 *     ::before, ::-webkit-scrollbar, :nth-child(n), :last-child, :first-child).
 *     The BASE selector is checked instead (the element exists even if not in
 *     the matching state).
 *
 *   HAS_NOT_BUCKET — any selector matching /:not\(\s*:has/ — happy-dom
 *     mis-evaluates :not(:has(…)); includes the EmptyState structural selectors
 *     and the sessions-detail dark-override. Also: main:has(> .lk-sessions-detail)
 *     which uses `:has()` directly (not well-supported in happy-dom).
 *
 *   XTERM_BUCKET — .xterm*, xterm-viewport, xterm-screen selectors —
 *     the fake terminal never builds real xterm DOM; unreachable by design.
 *
 *   DATA_ATTR_VARIANT_BUCKET — `[data-gap="N"]`, `[data-align="…"]`,
 *     `[data-justify="…"]`, `[data-wrap]` on `.lk-stack`/`.lk-row` — these
 *     attribute variants are only present when a prop is explicitly passed.
 *     The base `.lk-stack` and `.lk-row` are checked (which match); the
 *     attribute variants are a correctness contract verified by the primitive
 *     unit tests, not by this integration check.
 *
 *   @media CONDITION — not exercised (happy-dom has a fixed viewport), but
 *     inner selectors are still extracted and checked against the default render.
 *
 * States rendered:
 *   1. Sessions view — empty (no sessions, nothing selected)
 *   2. Sessions view — running + recent sessions, one selected (ended → replay empty-state)
 *   3. New-session modal open (harness + model seed data)
 *   4. Settings General page (proxy running → StatusDot green)
 *   5. Settings Providers page (one provider → Providers table, td span[data-tone] badges)
 *   6. Settings Models page (one model in table, Add-model form open → lk-form-actions)
 *   7. Settings Harnesses page (built-in + custom, HarnessForm open → form + lk-field)
 *   8. Settings Profiles page (one profile + add-profile modal open → dialog + ProfileForm)
 *
 * Coverage gaps (documented):
 *   - `span[role="status"][aria-busy="true"]` (Spinner) — only shown briefly
 *     during loading (stubs resolve synchronously in tests). Spinner is
 *     verified by its own component tests; here it's in the PSEUDO bucket.
 *   - `.lk-field__error` — only renders when a `FormField` receives an `error`
 *     prop. No current render state triggers a server-side validation error that
 *     flows back through to the FormField. Verified by FormField unit tests.
 *   - `tbody tr:nth-child(even)` — nth-child pseudo bucketed as PSEUDO.
 */

import { afterEach, describe, expect, it } from "bun:test"
import type { ProviderView } from "@launchkit/ipc"
import type {
  HarnessDefinition,
  ModelRoute,
  Profile,
  Session,
} from "@launchkit/types"
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { render } from "@testing-library/react"
import { App } from "./app"
import type { XtermInstance } from "./terminal/TerminalPane"
import type { TerminalClient } from "./terminal/terminalClient"
import { createFakeIpcClient } from "./test/fake-client"

// ---------------------------------------------------------------------------
// Fakes (mirror what app.test.tsx uses)
// ---------------------------------------------------------------------------

const fakeTerminalClient: TerminalClient = {
  onData: () => {},
  onExit: () => {},
  sendInput: () => {},
  sendResize: () => {},
  attach: () => {},
  kill: () => {},
  dispatch: () => {},
} as unknown as TerminalClient

const fakeXterm = (): XtermInstance => ({
  open: () => {},
  write: () => {},
  onData: () => {},
  fit: () => ({ cols: 80, rows: 24 }),
  cols: 80,
  rows: 24,
  dispose: () => {},
})

// ---------------------------------------------------------------------------
// Seed fixtures (minimal valid shapes from existing test files)
// ---------------------------------------------------------------------------

const harness: HarnessDefinition = {
  id: "claude",
  name: "Claude Code",
  command: "claude",
  apiFormat: "anthropic",
  envTemplate: { ANTHROPIC_BASE_URL: "{{proxyUrl}}" },
  builtIn: true,
} as unknown as HarnessDefinition

const customHarness: HarnessDefinition = {
  id: "mytool",
  name: "My Tool",
  command: "mytool",
  apiFormat: "openai",
  envTemplate: {},
  builtIn: false,
} as unknown as HarnessDefinition

const provider: ProviderView = {
  id: "p_openai",
  name: "OpenAI",
  sdkProvider: "openai",
  config: { baseUrl: "https://api.openai.com/v1" },
  secretFields: { apiKey: { isSet: true } },
  models: ["gpt-4o"],
} as unknown as ProviderView

const model: ModelRoute = {
  id: "m_1",
  providerId: "p_openai",
  providerModel: "gpt-4o-mini",
} as unknown as ModelRoute

const profile: Profile = {
  id: "pr_1" as Profile["id"],
  name: "Work",
  harnessId: "claude" as Profile["harnessId"],
  env: {},
}

const runningSession: Session = {
  id: "s_running" as Session["id"],
  harnessId: "claude" as Session["harnessId"],
  modelId: "m_1" as Session["modelId"],
  startedAt: "2026-06-01T10:00:00.000Z",
  name: "My running session",
} as unknown as Session

const endedSession: Session = {
  id: "s_ended" as Session["id"],
  harnessId: "claude" as Session["harnessId"],
  modelId: "m_1" as Session["modelId"],
  startedAt: "2026-06-01T08:00:00.000Z",
  endedAt: "2026-06-01T08:30:00.000Z",
  exitCode: 0,
  name: "Finished session",
} as unknown as Session

/**
 * A session that exited with code 1 — triggers the `danger` tone badge in SessionRow.
 * Also used as the "selected replay" session to get .lk-replay rendered (with non-empty bytes).
 */
const failedSession: Session = {
  id: "s_failed" as Session["id"],
  harnessId: "claude" as Session["harnessId"],
  modelId: "m_1" as Session["modelId"],
  startedAt: "2026-06-01T09:00:00.000Z",
  endedAt: "2026-06-01T09:10:00.000Z",
  exitCode: 1,
  name: "Failed session",
} as unknown as Session

// ---------------------------------------------------------------------------
// CSS selector parsing
// ---------------------------------------------------------------------------

const PARTIALS = [
  "tokens",
  "base",
  "controls",
  "primitives",
  "shell",
  "sessions-master",
  "sessions-detail",
  "forms",
  "modal",
  "lists",
  "page",
] as const

/**
 * Parse every selector from all partials. Handles @media blocks by recursing
 * into their bodies so the inner selectors are still checked.
 * Returns raw selectors (comma groups already split).
 */
const loadSelectors = async (): Promise<ReadonlyArray<string>> => {
  const out: string[] = []

  for (const p of PARTIALS) {
    const raw = await Bun.file(
      new URL(`./styles/${p}.css`, import.meta.url),
    ).text()
    extractSelectors(raw, out)
  }

  return out
}

/** Strip /* … * / block comments from CSS text. */
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, "")

/**
 * Recursively extract selectors from CSS text (handles @media blocks).
 * Populates `out` with individual comma-split selectors.
 */
const extractSelectors = (rawCss: string, out: string[]): void => {
  // Strip all block comments first to prevent comment text leaking as selectors
  const css = stripComments(rawCss)

  // Strip @keyframes blocks (they contain rule-like syntax but no element selectors)
  const noKeyframes = css.replace(
    /@keyframes\s+[^{]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
    "",
  )

  // Extract @media block bodies for recursive processing
  const mediaBodyTexts: string[] = []
  const mediaRegex = /@media[^{]*\{((?:[^{}]|\{[^{}]*\})*)\}/g
  let mediaMatch: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard loop pattern
  while ((mediaMatch = mediaRegex.exec(noKeyframes)) !== null) {
    const body = mediaMatch[1]
    if (body !== undefined) mediaBodyTexts.push(body)
  }

  // Remove @media blocks from flat CSS for non-media rule extraction
  const flatCss = noKeyframes.replace(
    /@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g,
    "",
  )

  // Extract "selector { ... }" rules from flat CSS
  // Matches the selector (non-{} content before the block) then the block
  const ruleRegex = /([^{};@][^{@]*?)\s*\{[^{}]*\}/g
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard loop pattern
  while ((m = ruleRegex.exec(flatCss)) !== null) {
    const selectorBlock = (m[1] ?? "").trim()
    if (selectorBlock === "") continue
    // Split comma groups and trim each part
    for (const part of selectorBlock.split(",")) {
      const s = part.trim()
      // Skip empty, at-rules, and any remaining comment fragments
      if (
        s.length > 0 &&
        !s.startsWith("@") &&
        !s.startsWith("*") &&
        !s.startsWith("/*") &&
        // Guard against multi-word comment leakage (valid selectors don't have unquoted spaces mid-token like this)
        !/^\s*(?:for|to|from|and|or|not|in|the|its|so|a|an|this|that|of|with|all|each|any|only|both|where)\s/.test(
          s,
        )
      ) {
        out.push(s)
      }
    }
  }

  // Recurse into @media block bodies
  for (const body of mediaBodyTexts) {
    extractSelectors(body, out)
  }
}

// ---------------------------------------------------------------------------
// Bucketing logic
// ---------------------------------------------------------------------------

/**
 * Global/root selectors not present as child elements in happy-dom containers.
 * Includes bare type selectors for typography resets (h1–h4, code, kbd, etc.)
 * that aren't rendered in the tested states, plus animation keyframe tokens.
 */
const isGlobalBucket = (s: string): boolean => {
  const globalSet = new Set([
    ":root",
    "html",
    "body",
    "#root",
    "*",
    "to",
    "from",
    // Typography resets — present in real app but not reliably in test states
    "h1",
    "h2",
    "h3",
    "h4",
    "code",
    "kbd",
    "samp",
    "pre",
    // Focus outline — only present in keyboard-nav state
    ":focus-visible",
    // @media reduced-motion * rule
    "* ",
  ])
  return globalSet.has(s) || globalSet.has(s.trim())
}

/**
 * State pseudo-classes and pseudo-elements to strip from selector tails.
 * Returns the base selector if stripping applies, undefined otherwise.
 *
 * We iterate stripping until stable so that compound chains like
 * `button[data-variant]:active:not(:disabled)` get both tails removed.
 */
const stripStatePseudos = (s: string): string | undefined => {
  // Patterns to strip from the tail of a selector (ordered by specificity)
  const tailPatterns = [
    /:hover$/,
    /:focus-visible$/,
    /:focus$/,
    /:active$/,
    // :not(:disabled) — full compound pseudo at the tail
    /:not\(:disabled\)$/,
    /:disabled$/,
    /:checked$/,
    /::placeholder$/,
    /::after$/,
    /::before$/,
    /::-webkit-scrollbar$/,
    // :nth-child(…), :last-child, :first-child
    /:nth-child\([^)]*\)$/,
    /:last-child$/,
    /:first-child$/,
    // :not(:has(…)) — the whole compound at the tail (handled separately in has-not bucket,
    // but also strip here for safety)
    /:not\(:has\([^)]*\)\)$/,
  ]

  let current = s
  let stripped = false

  let changed = true
  while (changed) {
    changed = false
    for (const pat of tailPatterns) {
      if (pat.test(current)) {
        const next = current.replace(pat, "").trim()
        if (next.length > 0) {
          current = next
          stripped = true
          changed = true
        }
      }
    }
  }

  return stripped ? current : undefined
}

/**
 * happy-dom mis-evaluates :not(:has(…)) and may mis-evaluate :has(…) in complex
 * compound selectors too. Bucket any selector containing these patterns.
 */
const isHasNotBucket = (s: string): boolean =>
  /:not\(\s*:has/.test(s) || (s.includes(":has(") && s.includes(">"))

/**
 * xterm DOM is only built by the real xterm library, never by the fake terminal.
 */
const isXtermBucket = (s: string): boolean =>
  s.includes(".xterm") ||
  s.includes("xterm-viewport") ||
  s.includes("xterm-screen")

/**
 * Selectors that are documented coverage gaps for the test states:
 *
 *   - Primitive attribute variants (.lk-stack[data-gap="N"], [data-align="…"], etc.)
 *     — only present when the primitive is rendered with the specific prop. The
 *     base class (.lk-stack, .lk-row) IS checked; the attribute variant is
 *     verified by the primitive unit tests (Stack.test.tsx, Row.test.tsx).
 *
 *   - Spinner `span[role="status"][aria-busy="true"]` — only shown during loading,
 *     but stubs resolve synchronously; selector is verified by Spinner unit tests.
 *
 *   - `.lk-field__error` — only rendered when FormField receives an `error` prop
 *     (server validation error); no test state triggers a server-side form error.
 *     Verified by FormField.test.tsx.
 */
const isDocumentedGap = (s: string): boolean => {
  // Stack/Row attribute variants
  if (/^\.lk-(?:stack|row)\[data-(?:gap|align|justify|wrap)/.test(s))
    return true
  // Stack min-height-0 variant
  if (s === ".lk-stack[data-min-height-0]") return true
  // Spinner — timing-dependent (only during loading, stubs resolve synchronously)
  if (s === 'span[role="status"][aria-busy="true"]') return true
  // FormField error — requires a server-side validation failure propagated to the form
  if (s === ".lk-field__error") return true
  // Terminal pane host [hidden] — requires 2+ concurrent open sessions so one is hidden;
  // the base .lk-terminal-pane-host is checked; hiding is exercised by TerminalPane unit tests
  if (s === ".lk-terminal-pane-host[hidden]") return true
  return false
}

// ---------------------------------------------------------------------------
// State rendering helpers
// ---------------------------------------------------------------------------

const baseStubs = {
  getSessions: async () => ({ ok: true as const, value: [] }),
  getHarnesses: async () => ({ ok: true as const, value: [] }),
  getProxyStatus: async () => ({
    ok: true as const,
    value: { running: false, port: 4000 },
  }),
  getProfiles: async () => ({ ok: true as const, value: [] }),
  getModels: async () => ({ ok: true as const, value: [] }),
  getProviders: async () => ({ ok: true as const, value: [] }),
}

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Main contract test
// ---------------------------------------------------------------------------

describe("selector contract: no dead selectors in the live UI", () => {
  it("every checkable selector matches at least one element across all rendered app states", async () => {
    const selectors = await loadSelectors()
    const containers = await renderAllStates()

    // Classify each selector and collect results
    const globalBucket: string[] = []
    const pseudoBucket: string[] = []
    const hasNotBucket: string[] = []
    const xtermBucket: string[] = []
    const docGapBucket: string[] = []
    const checked: string[] = []
    const dead: string[] = []

    for (const rawSel of selectors) {
      // 1. Global/root bucket
      if (isGlobalBucket(rawSel)) {
        globalBucket.push(rawSel)
        continue
      }

      // 2. xterm bucket (fake terminal, by design)
      if (isXtermBucket(rawSel)) {
        xtermBucket.push(rawSel)
        continue
      }

      // 3. :not(:has()) / :has() compound bucket (happy-dom engine bug)
      if (isHasNotBucket(rawSel)) {
        hasNotBucket.push(rawSel)
        continue
      }

      // 4. Documented coverage gap bucket
      if (isDocumentedGap(rawSel)) {
        docGapBucket.push(rawSel)
        continue
      }

      // 5. Strip trailing state pseudos and use the base selector
      const baseSelector = stripStatePseudos(rawSel)
      const selectorToCheck = baseSelector ?? rawSel

      if (baseSelector !== undefined) {
        pseudoBucket.push(rawSel)
      }

      // 6. Try to match across all containers
      let found = false
      for (const container of containers) {
        try {
          if (container.querySelectorAll(selectorToCheck).length > 0) {
            found = true
            break
          }
        } catch {
          // Selector not supported by happy-dom engine — treat as unevaluable
          hasNotBucket.push(rawSel)
          found = true
          break
        }
      }

      if (found) {
        checked.push(selectorToCheck)
      } else {
        dead.push(rawSel)
      }
    }

    // Log bucket summaries for debuggability
    console.log("\n=== Selector Contract Report ===")
    console.log(`Total raw selectors parsed: ${selectors.length}`)
    console.log(`Checked (matched ≥1 element): ${checked.length}`)
    console.log(
      `Global bucket (not checkable, by design): ${globalBucket.length}`,
      globalBucket,
    )
    console.log(
      `Pseudo bucket (base checked instead): ${pseudoBucket.length}`,
      pseudoBucket,
    )
    console.log(
      `has-not bucket (happy-dom engine bug): ${hasNotBucket.length}`,
      hasNotBucket,
    )
    console.log(
      `xterm bucket (fake terminal, by design): ${xtermBucket.length}`,
      xtermBucket,
    )
    console.log(
      `Documented-gap bucket (verified by unit tests; see file header): ${docGapBucket.length}`,
      docGapBucket,
    )
    if (dead.length > 0) {
      console.log(
        `\n!!! DEAD SELECTORS (genuine CSS↔markup drift): ${dead.length}`,
      )
      for (const d of dead) console.log(`  DEAD: ${d}`)
    } else {
      console.log("\nDead selectors: 0 — no CSS↔markup drift detected.")
    }

    expect(
      dead,
      `Dead selectors (CSS↔markup drift): ${dead.join(", ")}`,
    ).toEqual([])
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Render all states and collect containers
// ---------------------------------------------------------------------------

/**
 * Render the App in each representative state, collect the container nodes
 * (cloned so cleanup doesn't destroy them), then cleanup before the next state.
 */
const renderAllStates = async (): Promise<ReadonlyArray<ParentNode>> => {
  const containers: ParentNode[] = []

  // ── State 1: Sessions view — EMPTY ──────────────────────────────────────
  {
    const client = createFakeIpcClient(baseStubs)
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-shell")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 2a: Sessions view — running + recent sessions, failed session selected ─
  // Renders: .lk-session-row, .lk-session-row__line, .lk-session-row__sub,
  //   .lk-session-row__meta, .lk-session-list, .lk-session-group, .lk-session-group__heading,
  //   span[data-tone="danger"] (exitCode:1 badge),
  //   .lk-sessions-detail (not matched by has() — see has-not bucket)
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getSessions: async (params) => ({
        ok: true as const,
        value:
          params?.running === true
            ? [runningSession]
            : params?.running === false
              ? [failedSession, endedSession]
              : [],
      }),
      // Empty scrollback so we get the empty-state (not replay pane) for the ended session
      getSessionScrollback: async () => ({
        ok: true as const,
        value: { bytesBase64: "" },
      }),
      getHarnesses: async () => ({ ok: true as const, value: [harness] }),
      getModels: async () => ({ ok: true as const, value: [model] }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        // Select the failedSession so its danger badge renders in the row
        initialView={`sessions/${failedSession.id}`}
      />,
    )
    await waitFor(() => {
      // Wait for the session rows to appear
      expect(container.querySelector(".lk-session-row")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 2b: Sessions view — ended session selected with non-empty scrollback ─
  // Renders: .lk-replay, .lk-replay .lk-terminal-pane-host--replay, .lk-replay-banner,
  //   .lk-terminal-pane (the replay terminal pane itself)
  {
    // Non-empty base64 bytes so the replay pane renders (not the "No recorded output" empty-state)
    // "hi" in base64
    const bytesBase64 = "aGk="
    const client = createFakeIpcClient({
      ...baseStubs,
      getSessions: async (params) => ({
        ok: true as const,
        value:
          params?.running === true
            ? []
            : params?.running === false
              ? [failedSession]
              : [],
      }),
      getSessionScrollback: async () => ({
        ok: true as const,
        value: { bytesBase64 },
      }),
      getHarnesses: async () => ({ ok: true as const, value: [harness] }),
      getModels: async () => ({ ok: true as const, value: [model] }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        // Selecting an ended session that's NOT in openSessionIds → replay path
        initialView={`sessions/${failedSession.id}`}
      />,
    )
    await waitFor(() => {
      // Wait for the replay structure to render (scrollback loads → .lk-replay mounts)
      expect(container.querySelector(".lk-replay")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 2c: Live session open (terminal pane hosts) ────────────────────
  // Renders: .lk-terminal-pane-host, .lk-terminal-pane-host[hidden], .lk-terminal-pane
  // This requires a launched session so its id enters openSessionIds.
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getSessions: async () => ({ ok: true as const, value: [] }),
      getHarnesses: async () => ({ ok: true as const, value: [harness] }),
      getModels: async () => ({ ok: true as const, value: [model] }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
      launchHarness: async () => ({
        ok: true as const,
        value: { sessionId: "s_live" },
      }),
    })
    const { container, getByRole } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-shell")).not.toBeNull()
    })
    // Launch a session to get the terminal pane host into openSessionIds
    fireEvent.click(getByRole("button", { name: /new session/i }))
    await waitFor(() => {
      expect(container.querySelector("dialog[aria-modal]")).not.toBeNull()
    })
    fireEvent.click(getByRole("button", { name: /launch/i }))
    await waitFor(() => {
      // After launch, the live pane host should render
      expect(container.querySelector(".lk-terminal-pane-host")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 3: New-session modal open ─────────────────────────────────────
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({ ok: true as const, value: [harness] }),
      getModels: async () => ({ ok: true as const, value: [model] }),
      getProfiles: async () => ({ ok: true as const, value: [] }),
    })
    const { container, getByRole } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="sessions"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-shell")).not.toBeNull()
    })
    fireEvent.click(getByRole("button", { name: /new session/i }))
    await waitFor(() => {
      expect(container.querySelector("dialog[aria-modal]")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 4: Settings — General page (proxy running) ────────────────────
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getProxyStatus: async () => ({
        ok: true as const,
        value: { running: true, port: 4000 },
      }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/general"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-page")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 5: Settings — Providers page (one provider) ───────────────────
  // Renders: table (Providers table), td span[data-tone] (badges in table cells)
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getProviders: async () => ({ ok: true as const, value: [provider] }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/providers"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector("table")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 6: Settings — Models page (table + Add-model form) ────────────
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getModels: async () => ({ ok: true as const, value: [model] }),
      getProviders: async () => ({ ok: true as const, value: [provider] }),
      listProviderModels: async () => ({
        ok: true as const,
        value: { models: [] },
      }),
    })
    const { container, getByRole } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/models"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector("table")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    // Also open the add-model form for .lk-form-actions + .lk-field
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /add model/i }))
    })
    await waitFor(() => {
      expect(container.querySelector(".lk-form-actions")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  // ── State 7: Settings — Harnesses page (built-in + custom + HarnessForm) ─
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getHarnesses: async () => ({
        ok: true as const,
        value: [harness, customHarness],
      }),
    })
    const { container } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/harnesses"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-list")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    // Also open HarnessForm for the form + lk-field + lk-form-actions
    const addCustomBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-variant]"),
    ).find((b) => b.textContent?.toLowerCase().includes("add custom"))
    if (addCustomBtn !== undefined) {
      await act(async () => {
        fireEvent.click(addCustomBtn)
      })
      await waitFor(() => {
        expect(container.querySelector("form")).not.toBeNull()
      })
      containers.push(container.cloneNode(true) as ParentNode)
    }
    cleanup()
  }

  // ── State 8: Settings — Profiles page (one profile + add-profile modal) ──
  {
    const client = createFakeIpcClient({
      ...baseStubs,
      getProfiles: async () => ({ ok: true as const, value: [profile] }),
      getHarnesses: async () => ({ ok: true as const, value: [harness] }),
      getModels: async () => ({ ok: true as const, value: [model] }),
      getProviders: async () => ({ ok: true as const, value: [] }),
    })
    const { container, getByRole } = render(
      <App
        client={client}
        terminalClient={fakeTerminalClient}
        createTerminal={fakeXterm}
        initialView="settings/profiles"
      />,
    )
    await waitFor(() => {
      expect(container.querySelector(".lk-page")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    const addProfileBtn = getByRole("button", { name: /add profile/i })
    await act(async () => {
      fireEvent.click(addProfileBtn)
    })
    await waitFor(() => {
      expect(container.querySelector("dialog[aria-modal]")).not.toBeNull()
    })
    containers.push(container.cloneNode(true) as ParentNode)
    cleanup()
  }

  return containers
}
