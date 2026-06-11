import { describe, expect, it } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ModeSelector } from "./ModeSelector"

describe("ModeSelector", () => {
  it("renders only the supported modes in the menu", () => {
    render(
      <ModeSelector
        mode="manual"
        supportedModes={["manual", "bypass"]}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2)
    expect(screen.queryByText("Plan mode")).toBeNull()
    cleanup()
  })

  it("fires onChange and closes when a mode is picked", () => {
    let picked: string | undefined
    render(
      <ModeSelector
        mode="manual"
        supportedModes={["manual", "plan"]}
        onChange={(m) => {
          picked = m
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /plan mode/i }))
    expect(picked).toBe("plan")
    expect(screen.queryByRole("menu")).toBeNull()
    cleanup()
  })

  it("closes on Escape without changing the mode", () => {
    let calls = 0
    render(
      <ModeSelector
        mode="manual"
        supportedModes={["manual", "plan"]}
        onChange={() => {
          calls += 1
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /manual approval/i }))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(calls).toBe(0)
    cleanup()
  })

  it("marks the current mode checked in the menu", () => {
    render(
      <ModeSelector
        mode="bypass"
        supportedModes={["manual", "bypass"]}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /bypass permissions/i }))
    expect(
      screen.getByRole("menuitemradio", { name: /bypass permissions/i }),
    ).toHaveAttribute("aria-checked", "true")
    cleanup()
  })
})
