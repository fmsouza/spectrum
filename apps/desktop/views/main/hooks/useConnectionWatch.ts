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

  useEffect(() => {
    let active = true
    const handle = setInterval(() => {
      const current = now()
      const woke = isWakeGap(lastTick.current, current, gapMs)
      lastTick.current = current
      if (!woke) return
      void ping().then((ok) => {
        if (!active || ok) return
        setLost(true)
        onLost()
      })
    }, tickMs)
    return () => {
      active = false
      clearInterval(handle)
    }
  }, [ping, onLost, now, tickMs, gapMs])

  return { lost }
}
