import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// CSS-content contract for the AskUserQuestion wizard added in Task 3. These
// assertions lock the selectors + token references the wizard JSX depends on,
// and guard against regressions of two bugs already paid for:
//   1. `--sp-primary-soft` was used in `.lk-question__tab[data-state="current"]`
//      but is not a defined token (silent fallback) — Task 3 fixed by
//      substituting `--sp-info-soft`. We assert `--sp-info-soft` IS present and
//      `--sp-primary-soft` is NOT.
//   2. `.lk-question__actions` was a stale rule from the pre-wizard layout —
//      removed in Task 3. We assert it does NOT reappear.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, "run-view.css"), "utf8")

describe("QuestionCard wizard CSS contract", () => {
  it("declares the .lk-question[data-wizard] selector", () => {
    expect(css).toContain(".lk-question[data-wizard]")
  })

  it("declares the .lk-question__tabs selector", () => {
    expect(css).toContain(".lk-question__tabs")
  })

  it("declares the .lk-question__tab selector", () => {
    expect(css).toContain(".lk-question__tab")
  })

  it("declares the .lk-question__tab[data-state='current'] selector", () => {
    expect(css).toContain('.lk-question__tab[data-state="current"]')
  })

  it("declares the .lk-question__tab[data-state='answered'] selector", () => {
    expect(css).toContain('.lk-question__tab[data-state="answered"]')
  })

  it("declares the .lk-question__tab-label selector", () => {
    expect(css).toContain(".lk-question__tab-label")
  })

  it("declares the .lk-question__tab-check selector", () => {
    expect(css).toContain(".lk-question__tab-check")
  })

  it("declares the .lk-question__nav selector", () => {
    expect(css).toContain(".lk-question__nav")
  })

  it("declares the .lk-question__nav:not(:has(button:first-child)) fallback rule", () => {
    expect(css).toContain(".lk-question__nav:not(:has(button:first-child))")
  })

  it("uses var(--sp-info-soft) for the current tab background (Task 3 token fix)", () => {
    // The current tab rule must reference --sp-info-soft, which is the
    // defined token (declared in tokens.css). This locks the Task 3 fix.
    const currentBlock =
      css.match(
        /\.lk-question__tab\[data-state="current"\]\s*\{[^}]*\}/s,
      )?.[0] ?? ""
    expect(currentBlock).toContain("var(--sp-info-soft)")
  })
})

describe("QuestionCard wizard CSS — regression guards", () => {
  // NEGATIVE assertions: these tokens / rules were either removed or replaced
  // by Task 3 because they referenced undefined values / stale structure.
  // Re-adding them would silently regress.
  it("does NOT reference the undefined --sp-primary-soft token", () => {
    expect(css).not.toContain("var(--sp-primary-soft)")
  })

  it("does NOT contain the removed .lk-question__actions rule", () => {
    expect(css).not.toContain(".lk-question__actions")
  })
})
