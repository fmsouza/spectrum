import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { LaunchKitMark } from "./LaunchKitMark"

describe("LaunchKitMark", () => {
  it("renders an accessible img with the given title", () => {
    const { getByRole } = render(<LaunchKitMark title="LaunchKit" />)
    const svg = getByRole("img", { name: "LaunchKit" })
    expect(svg).toBeTruthy()
  })

  it("is aria-hidden when no title is provided", () => {
    const { container } = render(<LaunchKitMark />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
  })

  it("applies the requested pixel size to width and height", () => {
    const { container } = render(<LaunchKitMark size={48} />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBe("48")
    expect(svg?.getAttribute("height")).toBe("48")
  })

  it("renders the mono-white variant with white strokes", () => {
    const { container } = render(<LaunchKitMark variant="mono-white" />)
    expect(container.innerHTML).toContain("#FFFFFF")
  })
})
