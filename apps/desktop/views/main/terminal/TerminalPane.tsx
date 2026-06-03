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
  fit(): void
  readonly cols: number
  readonly rows: number
  dispose(): void
}

export type CreateTerminal = () => XtermInstance

export type TerminalPaneProps = {
  readonly sessionId: SessionId
  readonly client: TerminalClient
  /** Injected so the pane (and its consumers' tests) never load real xterm. */
  readonly createTerminal: CreateTerminal
}

/**
 * Mounts a single xterm terminal for one session into a div. Wires the bun PTY
 * stream both ways via the injected `TerminalClient`, refits on container
 * resize, and disposes only the xterm view on unmount (the bun session stays
 * alive). The xterm coupling is confined to the `createTerminal` factory so the
 * surrounding logic is testable without a real terminal.
 */
export const TerminalPane = ({
  sessionId,
  client,
  createTerminal,
}: TerminalPaneProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const term = createTerminal()
    term.open(container)

    const syncSize = (): void => {
      term.fit()
      client.sendResize(sessionId, term.cols, term.rows)
    }
    syncSize()

    client.onData(sessionId, (bytes) => term.write(bytes))
    client.onExit(sessionId, (code) => term.write(`\r\n[exited ${code}]\r\n`))
    term.onData((data) =>
      client.sendInput(sessionId, new TextEncoder().encode(data)),
    )
    client.attach(sessionId)

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => syncSize())
    observer?.observe(container)

    return () => {
      observer?.disconnect()
      term.dispose()
    }
  }, [sessionId, client, createTerminal])

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      data-session={sessionId}
    />
  )
}
