import { createAppContext } from "@spectrum/runtime-core"
import type { AppContext } from "@spectrum/runtime-core"

/**
 * Build the CLI's runtime context: the shared AppContext plus the stdout Writer the CLI runner
 * writes through. The CLI starts its own ephemeral proxy inside `launch` (exactly as today) — no
 * persistent proxy, no window, no detectMode.
 */
export const createCliContext = (): AppContext => createAppContext()
