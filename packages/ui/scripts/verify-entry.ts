// Throwaway build entry for the visual-verification script.
// Mounts the real Composer onto #root and exposes __setText on window, so the
// HTML page only needs to load this one self-contained bundle (no separate
// React import). The bundle inlines React via --no-external.
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"
import { Composer } from "../src/molecules/Composer"

type SetTextFn = (v: string) => void

function App(): ReturnType<typeof createElement> {
  const [, setText] = useState("")
  return createElement(Composer, { onSend: () => setText("") })
}

const rootEl = document.getElementById("root")
if (rootEl !== null) {
  createRoot(rootEl).render(createElement(App))
}

const setText: SetTextFn = (v) => {
  const ta = document.querySelector(".lk-composer__input")
  if (!(ta instanceof HTMLTextAreaElement)) return
  const desc = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )
  if (desc === undefined || desc.set === undefined) return
  desc.set.call(ta, v)
  ta.dispatchEvent(new Event("input", { bubbles: true }))
  ta.dispatchEvent(new Event("change", { bubbles: true }))
}

Object.assign(window, { __setText: setText })
