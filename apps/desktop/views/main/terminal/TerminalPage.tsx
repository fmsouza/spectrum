import type { SessionId } from "@launchkit/types"
import { EmptyState } from "@launchkit/ui"
import { type ReactElement, useEffect, useState } from "react"
import { TabStrip } from "./TabStrip"
import { type CreateTerminal, TerminalPane } from "./TerminalPane"
import type { TerminalClient } from "./terminalClient"

export type TerminalPageProps = {
  readonly client: TerminalClient
  readonly tabs: readonly SessionId[]
  readonly closeTab: (id: SessionId) => void
  /** Optional per-session display labels (e.g. harness ids). */
  readonly labels?: Readonly<Partial<Record<SessionId, string>>>
  /** Injected (real xterm in prod, a fake in tests); forwarded to each pane. */
  readonly createTerminal: CreateTerminal
}

/**
 * Composes the terminal tab strip with the per-session xterm panes. Owns only
 * the `activeId` selection; the tab set + lifecycle live in `useTerminals`
 * (threaded from the app). Every open session keeps its own mounted
 * `TerminalPane` so scrollback survives tab switches — inactive panes are
 * hidden, not unmounted.
 */
export const TerminalPage = ({
  client,
  tabs,
  closeTab,
  labels = {},
  createTerminal,
}: TerminalPageProps): ReactElement => {
  const [activeId, setActiveId] = useState<SessionId | null>(tabs[0] ?? null)

  // Keep a valid selection as tabs open/close: adopt a newly-opened tab and
  // fall back when the active one is closed.
  useEffect(() => {
    if (tabs.length === 0) {
      if (activeId !== null) setActiveId(null)
      return
    }
    if (activeId === null || !tabs.includes(activeId)) {
      setActiveId(tabs[tabs.length - 1] ?? null)
    }
  }, [tabs, activeId])

  if (tabs.length === 0) {
    return (
      <section aria-label="Terminal">
        <header>
          <h1>Terminal</h1>
        </header>
        <EmptyState
          title="No terminal sessions"
          hint="Launch a harness to open an embedded terminal."
        />
      </section>
    )
  }

  return (
    <div className="terminal-page">
      <TabStrip
        tabs={tabs}
        activeId={activeId}
        labels={labels}
        onSelect={setActiveId}
        onClose={closeTab}
      />
      <div className="terminal-panes">
        {tabs.map((id) => (
          <div
            key={id}
            className="terminal-pane-host"
            data-active={id === activeId}
            hidden={id !== activeId}
          >
            <TerminalPane
              sessionId={id}
              client={client}
              createTerminal={createTerminal}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
