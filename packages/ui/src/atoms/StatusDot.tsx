import type { ReactElement } from "react"

export type DotStatus = "on" | "off" | "error"

export type StatusDotProps = {
  readonly status: DotStatus
  readonly label: string
}

const dotColor = (status: DotStatus): "green" | "grey" | "red" =>
  status === "on" ? "green" : status === "error" ? "red" : "grey"

export const StatusDot = ({ status, label }: StatusDotProps): ReactElement => (
  <span role="img" aria-label={label} data-color={dotColor(status)} />
)
