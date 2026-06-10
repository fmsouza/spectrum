import type { Usage } from "@launchkit/agent-events"
import type { ReactElement } from "react"
import { TokenCount } from "../atoms/TokenCount"

export type UsageFooterProps = {
  readonly usage: Usage
}

export const UsageFooter = ({ usage }: UsageFooterProps): ReactElement => (
  <div className="lk-usage-footer">
    <TokenCount value={usage.inputTokens} unit="in" />
    <TokenCount value={usage.outputTokens} unit="out" />
    {usage.cachedInputTokens === undefined ? null : (
      <TokenCount value={usage.cachedInputTokens} unit="cached" />
    )}
    {usage.costUsd === undefined ? null : (
      <span className="lk-usage-footer__cost">{`$${usage.costUsd.toFixed(2)}`}</span>
    )}
  </div>
)
