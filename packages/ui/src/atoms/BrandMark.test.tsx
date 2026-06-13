import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { BrandMark } from "./BrandMark"

describe("BrandMark", () => {
  it("renders the Spectrum mark with an accessible label", () => {
    const { getByRole } = render(<BrandMark title="Spectrum" />)
    expect(getByRole("img", { name: "Spectrum" })).toBeTruthy()
  })
})
