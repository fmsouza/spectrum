import { describe, expect, it } from "bun:test"
import type { Usage } from "@launchkit/agent-events"
import { cleanup, render, screen } from "@testing-library/react"
import { UsageFooter } from "./UsageFooter"

const usage: Usage = { inputTokens: 1200, outputTokens: 340, costUsd: 0.02 }

describe("UsageFooter", () => {
  it("renders input and output token counts", () => {
    render(<UsageFooter usage={usage} />)
    expect(screen.getByText("1.2k in")).toBeInTheDocument()
    expect(screen.getByText("340 out")).toBeInTheDocument()
    cleanup()
  })

  it("renders the cost when present", () => {
    render(<UsageFooter usage={usage} />)
    expect(screen.getByText("$0.02")).toBeInTheDocument()
    cleanup()
  })

  it("omits the cost when absent", () => {
    render(<UsageFooter usage={{ inputTokens: 1, outputTokens: 1 }} />)
    expect(screen.queryByText(/\$/)).toBeNull()
    cleanup()
  })
})
