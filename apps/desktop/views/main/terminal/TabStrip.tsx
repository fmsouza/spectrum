import type { SessionId } from "@launchkit/types"
import type { ReactElement } from "react"

export type TabStripProps = {
  readonly tabs: readonly SessionId[]
  readonly activeId: SessionId | null
  /** Optional per-session display label (e.g. the harness id). */
  readonly labels: Readonly<Partial<Record<SessionId, string>>>
  readonly onSelect: (id: SessionId) => void
  readonly onClose: (id: SessionId) => void
}

/** Short, human-scannable fallback label when no harness name is known. */
const shortId = (id: SessionId): string => id.slice(0, 8)

/**
 * Dumb tab row for the embedded terminal: one tab per open session. The active
 * tab is highlighted and each tab carries a close affordance. All data and
 * callbacks are injected — this component owns no state and performs no effects.
 */
export const TabStrip = ({
  tabs,
  activeId,
  labels,
  onSelect,
  onClose,
}: TabStripProps): ReactElement => (
  <div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
    {tabs.map((id) => {
      const label = labels[id] ?? shortId(id)
      const active = id === activeId
      return (
        <div
          key={id}
          role="tab"
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          data-active={active}
          className="terminal-tab"
          onClick={() => onSelect(id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(id)
          }}
        >
          <span className="terminal-tab__label">{label}</span>
          <button
            type="button"
            className="terminal-tab__close"
            aria-label={`Close ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              onClose(id)
            }}
          >
            ×
          </button>
        </div>
      )
    })}
  </div>
)
