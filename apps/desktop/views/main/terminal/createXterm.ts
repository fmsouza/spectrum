import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
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

  // Switch to the WebGL renderer (what VS Code's terminal uses) instead of xterm's default DOM
  // renderer, which mispositions box-drawing / cursor-addressed output in this webview. Loaded LAZILY
  // after the first valid fit (see fit()) — not in open() — because at open() time the container can
  // still be 0×0, and WebGL initialised against a zero-size canvas measures a garbage char-cell that
  // never self-corrects. Letting the DOM renderer measure first means WebGL inherits a correct cell.
  let webglLoaded = false
  const loadWebglOnce = (): void => {
    if (webglLoaded) return
    webglLoaded = true
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* WebGL unavailable — keep the DOM renderer */
    }
  }

  return {
    open: (container) => {
      term.open(container)
    },
    write: (data) => term.write(data),
    onData: (cb) => {
      term.onData(cb)
    },
    fit: () => {
      // Validate the measurement BEFORE applying it. When xterm's char-cell size is measured wrong
      // (container not laid out / font not ready), FitAddon proposes an absurd column count (~1778
      // for a normal pane) — applying + sending that to the pty makes the harness render its TUI for
      // a ~1778-wide terminal, which clamps/wraps into garbage. Skip such bad measurements; a later
      // fit (settle timeout / ResizeObserver) applies the real size.
      const dims = fitAddon.proposeDimensions()
      if (
        dims === undefined ||
        !Number.isFinite(dims.cols) ||
        !Number.isFinite(dims.rows) ||
        dims.cols < 2 ||
        dims.cols > 1000 ||
        dims.rows < 2 ||
        dims.rows > 1000
      ) {
        return null
      }
      fitAddon.fit()
      // The grid is now correctly measured (DOM renderer); promote to WebGL for crisp rendering.
      loadWebglOnce()
      return { cols: term.cols, rows: term.rows }
    },
    get cols() {
      return term.cols
    },
    get rows() {
      return term.rows
    },
    dispose: () => term.dispose(),
  }
}
