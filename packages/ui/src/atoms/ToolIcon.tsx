import type { ReactElement } from "react"

export type ToolIconProps = {
  readonly tool: string
}

const KNOWN: Readonly<Record<string, string>> = {
  bash: "$",
  read: "◇",
  edit: "✎",
  write: "✎",
  grep: "⌕",
}

export const ToolIcon = ({ tool }: ToolIconProps): ReactElement => {
  const key = tool.toLowerCase()
  const glyph = KNOWN[key]
  return (
    <span
      className="lk-tool-icon"
      role="img"
      aria-label={tool}
      data-tool={glyph === undefined ? "default" : key}
    >
      {glyph ?? "▸"}
    </span>
  )
}
