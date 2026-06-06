import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"
import { SettingsLayout } from "./SettingsLayout"

describe("SettingsLayout", () => {
  it("renders the title as a heading", () => {
    render(
      <SettingsLayout title="Providers">
        <p>body</p>
      </SettingsLayout>,
    )
    expect(
      screen.getByRole("heading", { name: "Providers" }),
    ).toBeInTheDocument()
  })
  it("renders its children", () => {
    render(
      <SettingsLayout title="Providers">
        <p>body content</p>
      </SettingsLayout>,
    )
    expect(screen.getByText("body content")).toBeInTheDocument()
  })
  it("marks the page, header and body with hooks", () => {
    const { container } = render(
      <SettingsLayout title="General">
        <p>x</p>
      </SettingsLayout>,
    )
    expect(container.querySelector(".lk-page")).not.toBeNull()
    expect(container.querySelector(".lk-page__header")).not.toBeNull()
    expect(container.querySelector(".lk-page__body")).not.toBeNull()
  })
})
