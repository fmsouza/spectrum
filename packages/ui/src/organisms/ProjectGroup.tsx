import type { Session, SessionId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Badge } from "../atoms/Badge"
import { Button } from "../atoms/Button"
import { SessionRow } from "../molecules/SessionRow"
import type { SessionLabel } from "./ProjectList"

export type ProjectGroupProps = {
  readonly name: string
  /** Total sessions in this project (drives the Show-more button). */
  readonly sessionCount: number
  /** The currently loaded page of sessions (newest-first). */
  readonly sessions: readonly Session[]
  readonly collapsed: boolean
  readonly selectedId?: SessionId
  readonly labelFor: (session: Session) => SessionLabel
  readonly onToggle: () => void
  readonly onSelect: (id: SessionId) => void
  readonly onMore: () => void
}

export const ProjectGroup = ({
  name,
  sessionCount,
  sessions,
  collapsed,
  selectedId,
  labelFor,
  onToggle,
  onSelect,
  onMore,
}: ProjectGroupProps): ReactElement => {
  const hasMore = sessions.length < sessionCount
  return (
    <section className="lk-project-group">
      <button
        type="button"
        className="lk-project-group__header"
        aria-expanded={!collapsed}
        onClick={() => onToggle()}
      >
        <span className="lk-project-group__toggle" data-collapsed={collapsed} aria-hidden>
          ▸
        </span>
        <span className="lk-project-group__name">{name}</span>
        <Badge tone="neutral">{String(sessionCount)}</Badge>
      </button>
      {collapsed ? null : (
        <div className="lk-project-group__body">
          {sessions.map((s) => {
            const label = labelFor(s)
            return (
              <SessionRow
                key={s.id}
                session={s}
                harnessName={label.harnessName}
                model={label.model}
                selected={s.id === selectedId}
                onSelect={() => onSelect(s.id)}
              />
            )
          })}
          {hasMore ? (
            <Button variant="secondary" onClick={() => onMore()}>
              Show 10 more
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
