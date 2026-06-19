import type { Channel } from "./app-env"

const OFFSET: Record<Channel, number> = { stable: 0, canary: 1, development: 2 }

/** Per-channel proxy-port offset so simultaneously-running channels never collide on a port. */
export const channelProxyPortOffset = (channel: Channel): number =>
  OFFSET[channel]
