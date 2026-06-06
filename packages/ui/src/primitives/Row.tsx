import type { ReactElement, ReactNode } from "react"
import type { SpaceStep } from "./Stack"

export type RowAlign = "start" | "center" | "stretch"
export type RowJustify = "start" | "between" | "end"

export type RowProps = {
  readonly children: ReactNode
  readonly gap?: SpaceStep
  readonly align?: RowAlign
  readonly justify?: RowJustify
  readonly wrap?: boolean
  readonly className?: string
}

export const Row = ({
  children,
  gap,
  align,
  justify,
  wrap = false,
  className,
}: RowProps): ReactElement => (
  <div
    className={className === undefined ? "lk-row" : `lk-row ${className}`}
    {...(gap === undefined ? {} : { "data-gap": String(gap) })}
    {...(align === undefined ? {} : { "data-align": align })}
    {...(justify === undefined ? {} : { "data-justify": justify })}
    {...(wrap ? { "data-wrap": "" } : {})}
  >
    {children}
  </div>
)
