import { describe, expect, it } from "bun:test"
import type { FileChangeItem } from "@spectrum/agent-events"
import { cleanup, render, screen } from "@testing-library/react"
import { FileDiffCard } from "./FileDiffCard"

const item: FileChangeItem = {
  kind: "file-change",
  path: "src/app.ts",
  changeKind: "update",
  diff: "+added line\n-removed line",
}

describe("FileDiffCard", () => {
  it("renders the file path", () => {
    render(<FileDiffCard item={item} />)
    expect(screen.getByText("src/app.ts")).toBeInTheDocument()
    cleanup()
  })

  it("renders each diff line", () => {
    render(<FileDiffCard item={item} />)
    expect(screen.getByText("+added line")).toBeInTheDocument()
    expect(screen.getByText("-removed line")).toBeInTheDocument()
    cleanup()
  })

  it("marks the change kind on the card", () => {
    render(<FileDiffCard item={item} />)
    expect(screen.getByTestId("file-diff-src/app.ts")).toHaveAttribute(
      "data-kind",
      "update",
    )
    cleanup()
  })
})
