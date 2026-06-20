import { elapsedSecondsFrom } from "@spectrum/ui"
import { useEffect, useRef, useState } from "react"

const MIN_VISIBLE_SECONDS = 3

/**
 * Whole seconds the current turn has been in flight, or `undefined` when idle or
 * still under the visible threshold. The timer is owned here (the page) so the
 * pure `@spectrum/ui` components stay effect-free.
 */
export const useElapsedSeconds = (active: boolean): number | undefined => {
  const startRef = useRef<number | undefined>(undefined)
  const [seconds, setSeconds] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!active) {
      startRef.current = undefined
      setSeconds(undefined)
      return
    }
    startRef.current = Date.now()
    const tick = (): void => {
      const start = startRef.current
      if (start === undefined) return
      setSeconds(elapsedSecondsFrom(start, Date.now(), MIN_VISIBLE_SECONDS))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active])

  return seconds
}
