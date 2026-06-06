import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Row } from "./Row"

describe("Row", () => {
  it("renders children inside an lk-row element", () => {
    const { container, getByText } = render(
      <Row>
        <span>a</span>
      </Row>,
    )
    expect(container.querySelector(".lk-row")).not.toBeNull()
    expect(getByText("a")).not.toBeNull()
  })

  it("reflects gap, align, justify and wrap as data attributes when set", () => {
    const { container } = render(
      <Row gap={2} align="center" justify="between" wrap>
        <span>a</span>
      </Row>,
    )
    const el = container.querySelector(".lk-row")
    expect(el?.getAttribute("data-gap")).toBe("2")
    expect(el?.getAttribute("data-align")).toBe("center")
    expect(el?.getAttribute("data-justify")).toBe("between")
    expect(el?.hasAttribute("data-wrap")).toBe(true)
  })

  it("merges a caller className", () => {
    const { container } = render(
      <Row className="lk-form-actions">
        <span>a</span>
      </Row>,
    )
    expect(
      container.querySelector(".lk-row")?.classList.contains("lk-form-actions"),
    ).toBe(true)
  })

  it("emits no gap/align/justify/wrap attributes when no optional props are given", () => {
    const { container } = render(
      <Row>
        <span>a</span>
      </Row>,
    )
    const el = container.querySelector(".lk-row")
    expect(el?.hasAttribute("data-gap")).toBe(false)
    expect(el?.hasAttribute("data-align")).toBe(false)
    expect(el?.hasAttribute("data-justify")).toBe(false)
    expect(el?.hasAttribute("data-wrap")).toBe(false)
  })

  it("sets data-wrap only when wrap is true", () => {
    const { container: withWrap } = render(
      <Row wrap>
        <span>a</span>
      </Row>,
    )
    expect(withWrap.querySelector(".lk-row")?.hasAttribute("data-wrap")).toBe(
      true,
    )

    const { container: withoutWrap } = render(
      <Row>
        <span>a</span>
      </Row>,
    )
    expect(
      withoutWrap.querySelector(".lk-row")?.hasAttribute("data-wrap"),
    ).toBe(false)
  })
})
