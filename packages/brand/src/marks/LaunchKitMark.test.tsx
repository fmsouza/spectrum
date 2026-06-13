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

  it("renders the mono-black variant with black strokes", () => {
    const { container } = render(<LaunchKitMark variant="mono-black" />)
    expect(container.innerHTML).toContain("#000000")
  })

  it("gives each color mark instance a unique gradient id", () => {
    const { container } = render(
      <>
        <LaunchKitMark variant="color" />
        <LaunchKitMark variant="color" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll("radialGradient")).map(
      (g) => g.id,
    )
    expect(ids.length).toBe(2)
    expect(new Set(ids).size).toBe(2) // all unique
    // every url(#id) reference must point at an id that exists
    expect(container.innerHTML).toContain(`url(#${ids[0]})`)
    expect(container.innerHTML).toContain(`url(#${ids[1]})`)
  })

  it("escapes angle brackets in the title", () => {
    const { container } = render(<LaunchKitMark title={"a<b>c"} />)
    expect(container.innerHTML).toContain("a&lt;b&gt;c")
    expect(container.innerHTML).not.toContain("<b>c")
  })
})
