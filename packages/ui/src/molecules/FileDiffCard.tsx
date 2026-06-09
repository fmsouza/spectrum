import type { FileChangeItem } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { DiffLine } from "../atoms/DiffLine"

export type FileDiffCardProps = {
  readonly item: FileChangeItem
}

export const FileDiffCard = ({ item }: FileDiffCardProps): ReactElement => {
  const lines = item.diff === undefined ? [] : item.diff.split("\n")
  return (
    <div
      className="lk-file-diff"
      data-testid={`file-diff-${item.path}`}
      data-kind={item.changeKind}
    >
      <div className="lk-file-diff__path">{item.path}</div>
      {lines.length === 0 ? null : (
        <div className="lk-file-diff__body">
          {lines.map((line, i) => (
            <DiffLine key={`${i}-${line}`} text={line} />
          ))}
        </div>
      )}
    </div>
  )
}
