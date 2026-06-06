import type { ReactElement, ReactNode } from "react"

export type TruncateProps = {
  readonly children: ReactNode
  readonly className?: string
}

export const Truncate = ({
  children,
  className,
}: TruncateProps): ReactElement => (
  <span
    className={className === undefined ? "lk-truncate" : `lk-truncate ${className}`}
  >
    {children}
  </span>
)
