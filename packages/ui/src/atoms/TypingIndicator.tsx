import type { ReactElement } from "react"

/**
 * A three-dot "the harness is working" indicator, shown at the bottom of the feed while a turn is in
 * flight. The bounce animation lives in CSS (`.lk-typing`); this atom is pure markup.
 */
export const TypingIndicator = (): ReactElement => (
  // biome-ignore lint/a11y/useSemanticElements: a status live-region, not form <output>.
  <div className="lk-typing" role="status" aria-label="Working">
    <span className="lk-typing__dot" />
    <span className="lk-typing__dot" />
    <span className="lk-typing__dot" />
  </div>
)
