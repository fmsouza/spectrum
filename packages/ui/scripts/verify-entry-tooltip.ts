// Throwaway build entry for verify-tooltip-bubble.mjs.
// Mounts the real Tooltip component (the same one used in app) onto #root and
// exposes __openTooltip on window so the script can hover the trigger and read
// the resulting bubble's computed color/background-color from getComputedStyle.
//
// The CSS that the host HTML page links is the REAL apps/desktop partials — no
// stubs, no inline overrides — so any computed-style result reflects what the
// shipped app actually renders.
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { Tooltip } from "../src/atoms/Tooltip"

function App(): ReturnType<typeof createElement> {
  return createElement(
    "div",
    { style: { padding: "200px" } },
    createElement(
      Tooltip,
      { label: "Hover me — text should be legible on dark bubble" },
      createElement("button", { type: "button" }, "trigger"),
    ),
  )
}

const rootEl = document.getElementById("root")
if (rootEl !== null) {
  createRoot(rootEl).render(createElement(App))
}

const openTooltip = (): void => {
  const trigger = document.querySelector(".lk-tooltip button")
  if (!(trigger instanceof HTMLElement)) return
  trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  trigger.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
}

Object.assign(window, { __openTooltip: openTooltip })
