import { useId, useState } from "react"
import type { ReactElement, ReactNode } from "react"

export type TooltipPlacement = "top" | "bottom" | "left" | "right"

export type TooltipProps = {
  readonly label: string
  readonly placement?: TooltipPlacement
  readonly children: ReactNode
}

/**
 * Wraps a trigger and reveals a `role="tooltip"` bubble on hover/focus.
 * `mouseOver`/`mouseOut` (which bubble) let the wrapper react to events on the
 * inner trigger; `focus`/`blur` cover keyboard users; Escape dismisses it.
 */
export const Tooltip = ({
  label,
  placement = "top",
  children,
}: TooltipProps): ReactElement => {
  const id = useId()
  const [open, setOpen] = useState<boolean>(false)
  return (
    <span
      className="lk-tooltip"
      data-placement={placement}
      onMouseOver={() => setOpen(true)}
      onMouseOut={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open ? (
        <span role="tooltip" id={id} className="lk-tooltip__bubble">
          {label}
        </span>
      ) : null}
    </span>
  )
}
