import type { ReactElement } from "react"

export type ReasoningBlockProps = {
  readonly text: string
  readonly expanded: boolean
  readonly onToggle: () => void
}

export const ReasoningBlock = ({
  text,
  expanded,
  onToggle,
}: ReasoningBlockProps): ReactElement => (
  <div className="lk-reasoning" data-expanded={expanded}>
    <button
      type="button"
      className="lk-reasoning__header"
      aria-expanded={expanded}
      onClick={() => onToggle()}
    >
      Reasoning
    </button>
    {expanded ? <div className="lk-reasoning__body">{text}</div> : null}
  </div>
)
