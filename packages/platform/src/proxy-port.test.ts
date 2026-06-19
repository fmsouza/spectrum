import { expect, it } from "bun:test"
import { channelProxyPortOffset } from "./proxy-port"

it("offsets the proxy port per channel", () => {
  expect(channelProxyPortOffset("stable")).toBe(0)
  expect(channelProxyPortOffset("canary")).toBe(1)
  expect(channelProxyPortOffset("development")).toBe(2)
})
