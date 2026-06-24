/**
 * Reject if `promise` does not settle within `ms`. Used to bound startup IPC so a
 * wedged Electrobun RPC surfaces a visible fallback instead of an empty `#root`.
 * The timer is always cleared so a slow-but-eventual success does not leak it.
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>
}
