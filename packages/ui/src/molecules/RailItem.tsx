import type { ReactElement, ReactNode } from "react"
import { IconButton } from "../atoms/IconButton"

export type RailItemProps = {
  readonly label: string
  readonly active?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

export const RailItem = ({
  label,
  active = false,
  onClick,
  children,
}: RailItemProps): ReactElement => (
  <li>
    <IconButton label={label} active={active} onClick={onClick}>
      {children}
    </IconButton>
  </li>
)
