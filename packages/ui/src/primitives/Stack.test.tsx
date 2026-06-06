import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Stack } from "./Stack"

describe("Stack", () => {
  it("renders children inside an lk-stack element when given content", () => {
    const { getByText, container } = render(
      <Stack>
        <span>a</span>
      </Stack>,
    )
    const root = container.querySelector(".lk-stack")
    expect(root).not.toBeNull()
    expect(getByText("a")).not.toBeNull()
  })

  it("exposes the gap on a data attribute when gap is set", () => {
    const { container } = render(
      <Stack gap={4}>
        <span>a</span>
      </Stack>,
    )
    expect(container.querySelector(".lk-stack")?.getAttribute("data-gap")).toBe(
      "4",
    )
  })

  it("merges a caller className when one is provided", () => {
    const { container } = render(
      <Stack className="lk-session-list">
        <span>a</span>
      </Stack>,
    )
    const root = container.querySelector(".lk-stack")
    expect(root?.classList.contains("lk-session-list")).toBe(true)
  })

  it("sets data-min-height-0 when minHeight0 is requested", () => {
    const { container } = render(
      <Stack minHeight0>
        <span>a</span>
      </Stack>,
    )
    expect(
      container.querySelector(".lk-stack")?.hasAttribute("data-min-height-0"),
    ).toBe(true)
  })
})
