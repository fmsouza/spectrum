import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Truncate } from "./Truncate"

describe("Truncate", () => {
  it("wraps its text in an lk-truncate span", () => {
    const { container, getByText } = render(<Truncate>a long name</Truncate>)
    const el = container.querySelector("span.lk-truncate")
    expect(el).not.toBeNull()
    expect(getByText("a long name")).not.toBeNull()
  })

  it("merges a caller className", () => {
    const { container } = render(
      <Truncate className="lk-session-row__name">x</Truncate>,
    )
    expect(
      container
        .querySelector("span.lk-truncate")
        ?.classList.contains("lk-session-row__name"),
    ).toBe(true)
  })
})
