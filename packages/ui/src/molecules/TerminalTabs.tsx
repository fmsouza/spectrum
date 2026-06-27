import {
  type PointerEvent,
  type ReactElement,
  useCallback,
  useRef,
} from "react"
import { IconButton } from "../atoms/IconButton"

export interface TerminalTabItem {
  readonly id: string
  readonly title: string
  readonly exitCode: number | null
  readonly closed: boolean
}

export interface TerminalTabsProps {
  readonly tabs: readonly TerminalTabItem[]
  readonly activeTabId: string | null
  readonly onSelectTab: (tabId: string) => void
  readonly onNewTab: () => void
  readonly onCloseTab: (tabId: string) => void
  readonly onResizeHeight: (px: number) => void
  readonly currentHeightPx: number
}

export const TerminalTabs = (props: TerminalTabsProps): ReactElement => {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(props.currentHeightPx)

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      dragging.current = true
      startY.current = e.clientY
      startH.current = props.currentHeightPx
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [props.currentHeightPx],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      const delta = startY.current - e.clientY // up = grow
      props.onResizeHeight(Math.max(80, startH.current + delta))
    },
    [props],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div className="lk-terminal-tabs">
      <div
        className="lk-terminal-tabs__resize"
        role="separator"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="lk-terminal-tabs__strip">
        {props.tabs.map((t) => (
          <div
            key={t.id}
            className={`lk-terminal-tab${t.id === props.activeTabId ? " is-active" : ""}`}
            role="tab"
            tabIndex={0}
            onClick={() => props.onSelectTab(t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                props.onSelectTab(t.id)
              }
            }}
          >
            <span className="lk-terminal-tab__title">{t.title}</span>
            {t.closed && (
              <span className="lk-terminal-tab__exit">·{t.exitCode}</span>
            )}
            <button
              type="button"
              className="lk-terminal-tab__close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                props.onCloseTab(t.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <IconButton label="New terminal tab" onClick={props.onNewTab}>
          +
        </IconButton>
      </div>
    </div>
  )
}
