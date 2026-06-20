import type { ReactElement } from "react"

export type TypingIndicatorProps = {
  /** Seconds the current turn has been in flight; omitted = show dots only. */
  readonly elapsedSeconds?: number
}

/**
 * A three-dot "the harness is working" indicator, shown at the bottom of the feed while a turn is in
 * flight. The bounce animation lives in CSS (`.lk-typing`). When `elapsedSeconds` is provided, an
 * elapsed-time label reassures the user a slow turn is still progressing.
 */
export const TypingIndicator = ({
  elapsedSeconds,
}: TypingIndicatorProps): ReactElement => {
  const ariaLabel =
    elapsedSeconds === undefined
      ? "Working"
      : `Still generating, ${elapsedSeconds} seconds`

  return (
    // biome-ignore lint/a11y/useSemanticElements: a status live-region, not form <output>.
    <div className="lk-typing" role="status" aria-label={ariaLabel}>
      <span className="lk-typing__dot" />
      <span className="lk-typing__dot" />
      <span className="lk-typing__dot" />
      {elapsedSeconds === undefined ? null : (
        <span className="lk-typing__elapsed">
          still generating… ({elapsedSeconds}s)
        </span>
      )}
    </div>
  )
}
