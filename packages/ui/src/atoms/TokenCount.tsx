import type { ReactElement } from "react"

export type TokenCountProps = {
  readonly value: number
  readonly unit: "in" | "out" | "cached"
}

const format = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

export const TokenCount = ({ value, unit }: TokenCountProps): ReactElement => (
  <span className="lk-token-count" data-unit={unit}>
    {`${format(value)} ${unit}`}
  </span>
)
