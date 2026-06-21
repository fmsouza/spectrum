import type { ReactElement } from "react"
import { formatElapsed } from "./format-elapsed"

export type TypingIndicatorProps = {
  /** Seconds the current turn has been in flight; omitted = show dots only. */
  readonly elapsedSeconds?: number
}

/**
 * A three-dot "the harness is working" indicator, shown at the bottom of the feed while a turn is in
 * flight. The dots sit in their own row (`.lk-typing__dots`), with the optional elapsed-time label
 * beneath them, so the whole indicator is a centered column (`.lk-typing`). The bounce animation
 * lives in CSS. When `elapsedSeconds` is provided, a `Thinking… (<time>)` label reassures the user a
 * slow turn is still progressing; the aria-label mirrors the visible text so the SR announcement agrees.
 */
export const TypingIndicator = ({
  elapsedSeconds,
}: TypingIndicatorProps): ReactElement => {
  const ariaLabel =
    elapsedSeconds === undefined
      ? "Working"
      : `Thinking… (${formatElapsed(elapsedSeconds)})`

  return (
    // biome-ignore lint/a11y/useSemanticElements: a status live-region, not form <output>.
    <div className="lk-typing" role="status" aria-label={ariaLabel}>
      <span className="lk-typing__dots">
        <span className="lk-typing__dot" />
        <span className="lk-typing__dot" />
        <span className="lk-typing__dot" />
      </span>
      {elapsedSeconds === undefined ? null : (
        <span className="lk-typing__elapsed">
          Thinking… ({formatElapsed(elapsedSeconds)})
        </span>
      )}
    </div>
  )
}
