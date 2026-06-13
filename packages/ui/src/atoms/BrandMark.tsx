import { SpectrumMark, type SpectrumMarkProps } from "@spectrum/brand"
import type { ReactElement } from "react"

export type BrandMarkProps = SpectrumMarkProps

export const BrandMark = (props: BrandMarkProps): ReactElement => (
  <SpectrumMark {...props} />
)
