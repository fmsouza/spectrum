import { type ReactElement, useEffect, useRef } from "react"

export type ContextMenuItem = {
  readonly label: string
  readonly onSelect: () => void
  /** Render as a destructive item (red). */
  readonly danger?: boolean
}

export type ContextMenuProps = {
  /** Viewport x of the menu's top-left, in px (usually the cursor position). */
  readonly x: number
  readonly y: number
  readonly items: readonly ContextMenuItem[]
  readonly onClose: () => void
}

/**
 * A cursor-anchored popup menu. Pure/presentational: it owns only the close
 * interactions (Escape, outside-click) and emits item selection upward. Closes
 * itself after a selection. No data, no IPC.
 */
export const ContextMenu = ({
  x,
  y,
  items,
  onClose,
}: ContextMenuProps): ReactElement => {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    const onDown = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node))
        onClose()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [onClose])

  return (
    <ul
      ref={ref}
      className="lk-context-menu"
      role="menu"
      style={{ position: "fixed", top: y, left: x }}
    >
      {items.map((item) => (
        <li key={item.label} role="presentation">
          <button
            type="button"
            role="menuitem"
            className="lk-context-menu__item"
            data-variant={item.danger === true ? "danger" : "default"}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
