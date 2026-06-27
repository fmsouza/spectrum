let available: boolean | null = null

/** Probe whether the node-pty native addon can be loaded. Never throws. */
export const checkNativePtyAvailable = (): boolean => {
  if (available !== null) return available
  try {
    require("node-pty")
    available = true
  } catch {
    available = false
  }
  return available
}

export const nativePtyAvailable = (): boolean => available === true
