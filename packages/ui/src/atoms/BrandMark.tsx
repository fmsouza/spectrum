import { LaunchKitMark, type LaunchKitMarkProps } from "@launchkit/brand"
import type { ReactElement } from "react"

export type BrandMarkProps = LaunchKitMarkProps

export const BrandMark = (props: BrandMarkProps): ReactElement => (
  <LaunchKitMark {...props} />
)
