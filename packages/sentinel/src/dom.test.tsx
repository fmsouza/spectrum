import { describe, expect, it } from "bun:test"
import { render, screen } from "@testing-library/react"

const Hello = (): JSX.Element => <h1>hello</h1>

describe("DOM test harness", () => {
  it("renders a React element into a document when happy-dom is registered", () => {
    render(<Hello />)
    expect(screen.getByRole("heading", { name: "hello" })).toBeInTheDocument()
  })
})
