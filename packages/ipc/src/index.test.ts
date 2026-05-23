import { describe, expect, it } from "bun:test"
import * as ipc from "./index"

describe("@launchkit/ipc barrel", () => {
  it("exports the client/server factories, transport fakes, and schemas", () => {
    for (const name of [
      "ProviderViewSchema",
      "IpcMethodSchemas",
      "createIpcClient",
      "createIpcServer",
      "createMemoryTransportPair",
      "IpcRequestError",
    ]) {
      expect(ipc).toHaveProperty(name)
    }
  })
})
