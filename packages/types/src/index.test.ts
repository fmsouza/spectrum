import { describe, expect, it } from "bun:test"
import * as types from "./index"

describe("@launchkit/types barrel", () => {
  it("exports every schema and enum when imported", () => {
    for (const name of [
      "SdkProviderSchema",
      "ApiFormatSchema",
      "ProviderIdSchema",
      "ModelIdSchema",
      "HarnessIdSchema",
      "SessionIdSchema",
      "SecretRefSchema",
      "ProviderSchema",
      "ModelRouteSchema",
      "HarnessDefinitionSchema",
      "SessionSchema",
    ]) {
      expect(types).toHaveProperty(name)
    }
  })
})
