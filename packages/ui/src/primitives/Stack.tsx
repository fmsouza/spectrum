import type { ReactElement, ReactNode } from "react"

/** Token step 1–8 → var(--space-N). */
export type SpaceStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type StackProps = {
  readonly children: ReactNode
  /** Vertical gap as a spacing-scale step. */
  readonly gap?: SpaceStep
  /** Allow the stack to shrink below content height inside a flex/grid parent. */
  readonly minHeight0?: boolean
  /** Optional instance hook for area-specific CSS (e.g. "lk-session-list"). */
  readonly className?: string
}

export const Stack = ({
  children,
  gap,
  minHeight0 = false,
  className,
}: StackProps): ReactElement => (
  <div
    className={className === undefined ? "lk-stack" : `lk-stack ${className}`}
    {...(gap === undefined ? {} : { "data-gap": String(gap) })}
    {...(minHeight0 ? { "data-min-height-0": "" } : {})}
  >
    {children}
  </div>
)
