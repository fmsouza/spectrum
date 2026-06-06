import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"
import { FolderField } from "./FolderField"

describe("FolderField", () => {
  it("shows the current folder value in the input", () => {
    render(
      <FolderField
        id="cwd"
        value="/Users/fred/app"
        onChange={() => {}}
        onBrowse={() => {}}
      />,
    )
    expect(screen.getByDisplayValue("/Users/fred/app")).toBeInTheDocument()
  })
  it("calls onChange with the typed path when the input changes", () => {
    const onChange = mock((_v: string) => {})
    render(
      <FolderField id="cwd" value="" onChange={onChange} onBrowse={() => {}} />,
    )
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "/tmp/x" },
    })
    expect(onChange).toHaveBeenCalledWith("/tmp/x")
  })
  it("calls onBrowse when the Browse button is clicked", () => {
    const onBrowse = mock(() => {})
    render(
      <FolderField id="cwd" value="" onChange={() => {}} onBrowse={onBrowse} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /browse/i }))
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
  it("lays input and Browse out in an lk-folder-field row", () => {
    const { container } = render(<FolderField id="cwd" value="" onChange={() => {}} onBrowse={() => {}} />)
    expect(container.querySelector(".lk-row.lk-folder-field")).not.toBeNull()
  })
})
