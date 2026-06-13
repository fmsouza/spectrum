import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { BrandMark } from "./BrandMark"

describe("BrandMark", () => {
  it("renders the LaunchKit mark with an accessible label", () => {
    const { getByRole } = render(<BrandMark title="LaunchKit" />)
    expect(getByRole("img", { name: "LaunchKit" })).toBeTruthy()
  })
})
