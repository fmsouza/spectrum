import type { Session, SessionId } from "@launchkit/types"
import type { ReactElement } from "react"
import { Button } from "../atoms/Button"
import { Stack } from "../primitives/Stack"
import { SessionRow } from "../molecules/SessionRow"

export type SessionLabel = {
  readonly harnessName: string
  readonly model: string
}

export type SessionListProps = {
  readonly running: readonly Session[]
  readonly recent: readonly Session[]
  readonly labelFor: (session: Session) => SessionLabel
  readonly selectedId?: SessionId
  readonly hasMore: boolean
  readonly onSelect: (id: SessionId) => void
  readonly onMore: () => void
  readonly onNew: () => void
}

export const SessionList = ({
  running,
  recent,
  labelFor,
  selectedId,
  hasMore,
  onSelect,
  onMore,
  onNew,
}: SessionListProps): ReactElement => {
  const renderRow = (session: Session): ReactElement => {
    const label = labelFor(session)
    return (
      <SessionRow
        key={session.id}
        session={session}
        harnessName={label.harnessName}
        model={label.model}
        selected={session.id === selectedId}
        onSelect={() => onSelect(session.id)}
      />
    )
  }

  return (
    <Stack gap={4} minHeight0 className="lk-session-list">
      <Button onClick={() => onNew()}>+ New session</Button>
      <section className="lk-session-group">
        <h3 className="lk-session-group__heading">Running</h3>
        {running.map(renderRow)}
      </section>
      <section className="lk-session-group">
        <h3 className="lk-session-group__heading">Recent</h3>
        {recent.map(renderRow)}
      </section>
      {hasMore ? (
        <Button variant="secondary" onClick={() => onMore()}>
          View more
        </Button>
      ) : null}
    </Stack>
  )
}
