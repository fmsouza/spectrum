import { describe, expect, it } from "bun:test"
import * as types from "./index"

describe("@launchkit/types barrel", () => {
  it("exports every schema and enum when imported", () => {
    for (const name of [
      "SdkProviderSchema",
      "ApiFormatSchema",
      "ProviderIdSchema",
      "AliasNameSchema",
      "HarnessIdSchema",
      "SessionIdSchema",
      "ProfileIdSchema",
      "SecretRefSchema",
      "ProviderSchema",
      "ModelAliasSchema",
      "HarnessDefinitionSchema",
      "SessionSchema",
      "ProfileSchema",
    ]) {
      expect(types).toHaveProperty(name)
    }
  })
})
