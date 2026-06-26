import { useEffect, useRef, useState } from "react"

/**
 * A wall-clock gap larger than `gapMs` between two ~`tickMs` interval ticks means
 * the machine almost certainly slept (timers don't fire while suspended). Pure so
 * it is unit-testable without fake timers.
 */
export const isWakeGap = (
  prevTickMs: number,
  nowMs: number,
  gapMs: number,
): boolean => nowMs - prevTickMs > gapMs

/**
 * Detects wake-from-sleep via an interval-gap heuristic and, on wake, pings the
 * backend. A failed ping means the connection died during sleep (a half-dead
 * socket may never emit `close`), so `onLost` fires — the caller self-reloads,
 * re-establishing both the Electrobun RPC and the runner socket.
 *
 * Recovery is a proper state machine, not a side-effect latch: once `lost` is
 * true we keep pinging on every tick and clear `lost` as soon as a ping succeeds.
 * This self-heals the overlay even when the self-reload (`onLost`) never actually
 * remounts the SPA (e.g. the Electrobun webview suppresses the reload) — which
 * would otherwise leave the "reconnecting" overlay stuck forever while the agent
 * keeps running fine behind it.
 */
export const useConnectionWatch = (deps: {
  readonly ping: () => Promise<boolean>
  readonly onLost: () => void
  readonly now: () => number
  readonly tickMs?: number
  readonly gapMs?: number
}): { readonly lost: boolean } => {
  const { ping, onLost, now } = deps
  const tickMs = deps.tickMs ?? 2000
  const gapMs = deps.gapMs ?? 10000
  const [lost, setLost] = useState(false)
  const lastTick = useRef(now())
  const lostRef = useRef(false)

  useEffect(() => {
    let active = true
    const handle = setInterval(() => {
      const current = now()
      const woke = isWakeGap(lastTick.current, current, gapMs)
      lastTick.current = current
      // After a detected loss, keep probing every tick until the backend answers —
      // the wake-gap gate alone would never re-ping once the machine is awake and
      // ticking normally, so the latch would never clear.
      if (!woke && !lostRef.current) return
      void ping().then((ok) => {
        if (!active) return
        if (ok) {
          // Connection recovered: clear the overlay.
          if (lostRef.current) {
            lostRef.current = false
            setLost(false)
          }
          return
        }
        // Connection lost (or still lost): latch the overlay and nudge a reload.
        if (!lostRef.current) {
          lostRef.current = true
          setLost(true)
          onLost()
        }
      })
    }, tickMs)
    return () => {
      active = false
      clearInterval(handle)
    }
  }, [ping, onLost, now, tickMs, gapMs])

  return { lost }
}
