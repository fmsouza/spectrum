import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { CreateTerminal, XtermInstance } from "./TerminalPane"

/**
 * The real `@xterm/xterm` terminal factory (with the fit addon), themed to match
 * the app's design tokens. Kept in its own module so it — and the heavy xterm
 * package + its CSS — never enter the test module graph: `TerminalPane` is
 * factory-injected and tests pass a fake `createTerminal` instead. xterm's
 * stylesheet is vendored to `views/main/xterm.css` and linked from `index.html`
 * (NOT imported here) so the view bundler never emits it as `app.css` and
 * clobbers the hand-written theme.
 */
export const createXterm: CreateTerminal = (): XtermInstance => {
  const term = new Terminal({
    fontFamily:
      'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    cursorBlink: true,
    theme: {
      background: "#111216",
      foreground: "#ecedf1",
      cursor: "#f0763b",
      selectionBackground: "#38231a",
    },
  })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  return {
    open: (container) => term.open(container),
    write: (data) => term.write(data),
    onData: (cb) => {
      term.onData(cb)
    },
    fit: () => fitAddon.fit(),
    get cols() {
      return term.cols
    },
    get rows() {
      return term.rows
    },
    dispose: () => term.dispose(),
  }
}
