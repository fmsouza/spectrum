import type { ReactElement } from "react"

export type DiffLineProps = {
  readonly text: string
}

const kindOf = (text: string): "add" | "del" | "context" => {
  if (text.startsWith("+")) return "add"
  if (text.startsWith("-")) return "del"
  return "context"
}

export const DiffLine = ({ text }: DiffLineProps): ReactElement => (
  <span className="lk-diff-line" data-kind={kindOf(text)}>
    {text}
  </span>
)
