import { type ReactElement, useEffect, useRef } from "react"
import { IconButton } from "../atoms/IconButton"
import { type TerminalTabItem, TerminalTabs } from "../molecules/TerminalTabs"

export interface TerminalPaneProps {
  readonly tabs: readonly TerminalTabItem[]
  readonly activeTabId: string | null
  readonly paneHeightPx: number
  readonly onSelectTab: (tabId: string) => void
  readonly onNewTab: () => void
  readonly onCloseTab: (tabId: string) => void
  readonly onResizeHeight: (px: number) => void
  readonly onClose: () => void
  /** Host mounts the xterm Terminal for the active tab into `container`. */
  readonly mountTerminal: (tabId: string, container: HTMLElement) => () => void
}

export const TerminalPane = (props: TerminalPaneProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !props.activeTabId) return
    const cleanup = props.mountTerminal(props.activeTabId, container)
    return cleanup
  }, [props.activeTabId, props.mountTerminal])

  return (
    <section
      className="lk-terminal-pane"
      style={{ height: props.paneHeightPx }}
    >
      <TerminalTabs
        tabs={props.tabs}
        activeTabId={props.activeTabId}
        onSelectTab={props.onSelectTab}
        onNewTab={props.onNewTab}
        onCloseTab={props.onCloseTab}
        onResizeHeight={props.onResizeHeight}
        currentHeightPx={props.paneHeightPx}
      />
      <div className="lk-terminal-pane__close">
        <IconButton label="Close terminal pane" onClick={props.onClose}>
          ▾
        </IconButton>
      </div>
      <div className="lk-terminal-pane__screen" ref={containerRef} />
    </section>
  )
}
