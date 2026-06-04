import type { SessionId } from "@launchkit/types"
import { type ReactElement, useEffect, useRef } from "react"
import type { TerminalClient } from "./terminalClient"

/**
 * The minimal slice of the xterm `Terminal` + `FitAddon` surface this pane
 * drives. Declaring it locally (rather than importing xterm's type) keeps the
 * pane testable with a fake factory and the heavy xterm package + its CSS out
 * of the test module graph — the real factory lives in `./createXterm`.
 */
export interface XtermInstance {
  open(container: HTMLElement): void
  write(data: string | Uint8Array): void
  onData(cb: (data: string) => void): void
  /**
   * Fit the grid to the container and return the applied size, or `null` if the measurement was
   * rejected as invalid (e.g. the renderer's char-cell size wasn't ready, which yields an absurd
   * column count). Callers must NOT resize the pty on a `null` — that bogus size would garble the
   * harness TUI; wait for a later fit instead.
   */
  fit(): { readonly cols: number; readonly rows: number } | null
  readonly cols: number
  readonly rows: number
  dispose(): void
}

export type CreateTerminal = () => XtermInstance

export type TerminalPaneProps =
  | {
      readonly mode?: "live"
      readonly sessionId: SessionId
      readonly client: TerminalClient
      /** Injected so the pane (and its consumers' tests) never load real xterm. */
      readonly createTerminal: CreateTerminal
    }
  | {
      readonly mode: "replay"
      readonly sessionId: SessionId
      readonly client: TerminalClient
      /** Injected so the pane (and its consumers' tests) never load real xterm. */
      readonly createTerminal: CreateTerminal
      /** The decoded scrollback bytes to render once, read-only. */
      readonly bytes: Uint8Array
    }

/**
 * Mounts a single xterm terminal for one session into a div. Wires the bun PTY
 * stream both ways via the injected `TerminalClient`, refits on container
 * resize, and disposes only the xterm view on unmount (the bun session stays
 * alive). The xterm coupling is confined to the `createTerminal` factory so the
 * surrounding logic is testable without a real terminal.
 *
 * In `"replay"` mode the pane does NOT wire `term.onData` or any PTY
 * input/attach/resize; it writes a provided `bytes: Uint8Array` once and is
 * otherwise inert (read-only).
 */
export const TerminalPane = (props: TerminalPaneProps): ReactElement => {
  const { sessionId, client, createTerminal } = props
  const replayBytes = props.mode === "replay" ? props.bytes : undefined
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const term = createTerminal()
    term.open(container)

    if (replayBytes !== undefined) {
      // Read-only: render the captured bytes once. No onData (no input), no attach, no resize
      // wiring — the session has ended; we are just showing its final output.
      term.write(replayBytes)
      return () => {
        term.dispose()
      }
    }

    // ── live (existing behaviour) ──
    // Register stream handlers up front so no early output is missed.
    client.onData(sessionId, (bytes) => term.write(bytes))
    client.onExit(sessionId, (code) => term.write(`\r\n[exited ${code}]\r\n`))
    term.onData((data) =>
      client.sendInput(sessionId, new TextEncoder().encode(data)),
    )

    const syncSize = (): void => {
      // Skip while the pane is hidden / zero-size (inactive tabs are display:none). Fitting then
      // would compute xterm's minimum (~10x6) and resize the pty to it, making the harness reflow
      // its TUI to a tiny grid — garbling the session until it's shown again. Only fit when visible.
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      const dims = term.fit()
      // A null fit means xterm measured a bad char-cell size and proposed an absurd grid; sending it
      // would make the harness render its TUI for the wrong width (garbled). Skip — a later fit wins.
      if (dims === null) return
      client.sendResize(sessionId, dims.cols, dims.rows)
    }

    // Defer the first fit to AFTER the browser has laid out the container and xterm has measured
    // its character cell. Calling fit() synchronously right after open() measures an unready grid
    // and picks the wrong cols/rows, so the harness renders its TUI for the wrong width (garbled,
    // wrapped lines). Fit on the next frame, then attach (replays scrollback at the correct size);
    // a second fit shortly after catches any late layout/scrollbar settling.
    const raf = requestAnimationFrame(() => {
      syncSize()
      client.attach(sessionId)
    })
    const settle = setTimeout(syncSize, 60)

    // Debounce container resizes: a window drag fires a storm of ResizeObserver callbacks, and
    // spamming the harness with SIGWINCH (one per pty-resize) leaves its TUI mid-redraw. Send only
    // the final size once the drag pauses.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (resizeTimer !== null) clearTimeout(resizeTimer)
            resizeTimer = setTimeout(syncSize, 80)
          })
    observer?.observe(container)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      observer?.disconnect()
      term.dispose()
    }
  }, [sessionId, client, createTerminal, replayBytes])

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      data-session={sessionId}
    />
  )
}
