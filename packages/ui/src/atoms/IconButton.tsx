import type { ReactElement, ReactNode } from "react"

export type IconButtonProps = {
  readonly label: string
  readonly active?: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}

export const IconButton = ({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: IconButtonProps): ReactElement => (
  <button
    type="button"
    aria-label={label}
    aria-current={active ? "page" : undefined}
    data-active={active}
    disabled={disabled}
    onClick={() => {
      if (!disabled) onClick()
    }}
  >
    {children}
  </button>
)
