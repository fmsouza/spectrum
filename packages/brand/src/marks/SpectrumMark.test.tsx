import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { SpectrumMark } from "./SpectrumMark"

describe("SpectrumMark", () => {
  it("renders an accessible img with the given title", () => {
    const { getByRole } = render(<SpectrumMark title="Spectrum" />)
    expect(getByRole("img", { name: "Spectrum" })).toBeTruthy()
  })

  it("is aria-hidden when no title is provided", () => {
    const { container } = render(<SpectrumMark />)
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    )
  })

  it("applies the requested pixel size to width and height", () => {
    const { container } = render(<SpectrumMark size={48} />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBe("48")
    expect(svg?.getAttribute("height")).toBe("48")
  })

  it("renders all five spectrum accents incl. rose in the color variant", () => {
    const { container } = render(<SpectrumMark variant="color" />)
    for (const hex of ["#A56BFF", "#22D3EE", "#4ADE80", "#FFB13B", "#F472B6"]) {
      expect(container.innerHTML).toContain(hex)
    }
  })

  it("renders the mono-white variant with white strokes and no accents", () => {
    const { container } = render(<SpectrumMark variant="mono-white" />)
    expect(container.innerHTML).toContain("#FFFFFF")
    expect(container.innerHTML).not.toContain("#F472B6")
  })

  it("renders the mono-black variant with black strokes", () => {
    const { container } = render(<SpectrumMark variant="mono-black" />)
    expect(container.innerHTML).toContain("#000000")
  })

  it("gives each color mark instance a unique gradient id", () => {
    const { container } = render(
      <>
        <SpectrumMark variant="color" />
        <SpectrumMark variant="color" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll("radialGradient")).map(
      (g) => g.id,
    )
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2)
    expect(container.innerHTML).toContain(`url(#${ids[0]})`)
    expect(container.innerHTML).toContain(`url(#${ids[1]})`)
  })

  it("uses the sp_hub_ gradient id prefix", () => {
    const { container } = render(<SpectrumMark variant="color" />)
    expect(container.querySelector("radialGradient")?.id).toMatch(/^sp_hub_/)
  })

  it("escapes angle brackets in the title", () => {
    const { container } = render(<SpectrumMark title={"a<b>c"} />)
    expect(container.innerHTML).toContain("a&lt;b&gt;c")
    expect(container.innerHTML).not.toContain("<b>c")
  })
})
