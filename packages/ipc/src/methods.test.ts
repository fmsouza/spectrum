import { describe, expect, it } from "bun:test"
import type {
  AliasName,
  HarnessId,
  Profile,
  ProfileId,
  ProviderId,
  SessionId,
} from "@launchkit/types"
import {
  AddProfileParamsSchema,
  AddProfileResultSchema,
  AddProviderParamsSchema,
  DeleteProfileParamsSchema,
  DeleteProfileResultSchema,
  GetProfilesParamsSchema,
  GetProfilesResultSchema,
  GetSessionScrollbackParamsSchema,
  GetSessionScrollbackResultSchema,
  GetSessionsParamsSchema,
  IpcMethodSchemas,
  LaunchHarnessParamsSchema,
  LaunchHarnessResultSchema,
  PickFolderParamsSchema,
  PickFolderResultSchema,
  SetProviderSecretParamsSchema,
  UpdateProfileParamsSchema,
  UpdateProfileResultSchema,
} from "./methods"

const sampleProfile: Profile = {
  id: "prof_default" as ProfileId,
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

const profileInput = {
  name: "Default",
  harnessId: "claude" as Profile["harnessId"],
  alias: "default" as Profile["alias"],
  env: { ANTHROPIC_MODEL: "sonnet" },
}

describe("AddProviderParamsSchema", () => {
  it("parses an input with non-secret config and secret field names", () => {
    const input = {
      name: "OpenAI",
      sdkProvider: "openai" as const,
      config: { baseUrl: "https://api.openai.com/v1" },
      secretFieldNames: ["apiKey"],
      models: ["gpt-4o"],
    }
    expect(AddProviderParamsSchema.parse(input)).toEqual(input)
  })
  it("rejects an add-provider input that smuggles a secret value", () => {
    const input = {
      name: "OpenAI",
      sdkProvider: "openai" as const,
      config: { baseUrl: "x" },
      secretFieldNames: ["apiKey"],
      models: ["gpt-4o"],
      secrets: { apiKey: "sk-leak" },
    }
    expect(AddProviderParamsSchema.safeParse(input).success).toBe(false)
  })
})

describe("SetProviderSecretParamsSchema", () => {
  it("parses the only secret-bearing method's params", () => {
    const p = {
      providerId: "p_openai" as ProviderId,
      field: "apiKey",
      value: "sk-secret",
    }
    expect(SetProviderSecretParamsSchema.parse(p)).toEqual(p)
  })
  it("rejects an empty secret value", () => {
    expect(
      SetProviderSecretParamsSchema.safeParse({
        providerId: "p" as ProviderId,
        field: "apiKey",
        value: "",
      }).success,
    ).toBe(false)
  })
})

describe("LaunchHarnessParamsSchema", () => {
  it("parses with an optional alias omitted", () => {
    expect(
      LaunchHarnessParamsSchema.parse({ id: "claude" as HarnessId }),
    ).toEqual({ id: "claude" as HarnessId })
  })
  it("parses with an alias provided", () => {
    expect(
      LaunchHarnessParamsSchema.parse({
        id: "claude" as HarnessId,
        alias: "fast" as AliasName,
      }),
    ).toEqual({ id: "claude" as HarnessId, alias: "fast" as AliasName })
  })
  it("parses launch params with name, cwd, and env", () => {
    expect(
      LaunchHarnessParamsSchema.parse({
        id: "claude" as HarnessId,
        alias: "fast" as AliasName,
        name: "My run",
        cwd: "/Users/fred/projects/app",
        env: { ANTHROPIC_MODEL: "sonnet" },
      }),
    ).toEqual({
      id: "claude" as HarnessId,
      alias: "fast" as AliasName,
      name: "My run",
      cwd: "/Users/fred/projects/app",
      env: { ANTHROPIC_MODEL: "sonnet" },
    })
  })
  it("rejects an env whose values are not strings", () => {
    expect(
      LaunchHarnessParamsSchema.safeParse({
        id: "claude" as HarnessId,
        env: { PORT: 8080 },
      }).success,
    ).toBe(false)
  })
})

describe("LaunchHarnessResultSchema", () => {
  it("parses a result carrying only the created sessionId", () => {
    const parsed = LaunchHarnessResultSchema.parse({ sessionId: "s_1" })
    expect(parsed.sessionId).toBe("s_1" as typeof parsed.sessionId)
  })
  it("rejects a result missing the sessionId", () => {
    expect(LaunchHarnessResultSchema.safeParse({}).success).toBe(false)
  })
})

describe("GetSessionsParamsSchema", () => {
  it("parses an absent filter as undefined", () => {
    expect(GetSessionsParamsSchema.parse(undefined)).toBeUndefined()
  })
  it("parses a filter narrowing by harnessId", () => {
    expect(
      GetSessionsParamsSchema.parse({ harnessId: "claude" as HarnessId }),
    ).toEqual({ harnessId: "claude" as HarnessId })
  })
  it("parses a filter narrowing by running, limit, and offset", () => {
    expect(
      GetSessionsParamsSchema.parse({ running: true, limit: 20, offset: 0 }),
    ).toEqual({ running: true, limit: 20, offset: 0 })
  })
  it("rejects a non-positive limit", () => {
    expect(GetSessionsParamsSchema.safeParse({ limit: 0 }).success).toBe(false)
  })
  it("rejects a negative offset", () => {
    expect(GetSessionsParamsSchema.safeParse({ offset: -1 }).success).toBe(
      false,
    )
  })
})

describe("GetProfilesParamsSchema", () => {
  it("parses undefined params", () => {
    expect(GetProfilesParamsSchema.parse(undefined)).toBeUndefined()
  })
})

describe("GetProfilesResultSchema", () => {
  it("parses an array of profiles", () => {
    expect(GetProfilesResultSchema.parse([sampleProfile])).toEqual([
      sampleProfile,
    ])
  })
  it("rejects a non-array result", () => {
    expect(GetProfilesResultSchema.safeParse({}).success).toBe(false)
  })
})

describe("AddProfileParamsSchema", () => {
  it("parses a profile input without an id (server mints it)", () => {
    expect(AddProfileParamsSchema.parse(profileInput)).toEqual(profileInput)
  })
  it("rejects an input that supplies an id", () => {
    expect(
      AddProfileParamsSchema.safeParse({ ...profileInput, id: "prof_x" })
        .success,
    ).toBe(false)
  })
  it("rejects an input with an empty name", () => {
    expect(
      AddProfileParamsSchema.safeParse({ ...profileInput, name: "" }).success,
    ).toBe(false)
  })
})

describe("AddProfileResultSchema", () => {
  it("parses a full profile carrying the minted id", () => {
    expect(AddProfileResultSchema.parse(sampleProfile)).toEqual(sampleProfile)
  })
})

describe("UpdateProfileParamsSchema", () => {
  it("parses a full profile (id included)", () => {
    expect(UpdateProfileParamsSchema.parse(sampleProfile)).toEqual(
      sampleProfile,
    )
  })
  it("rejects a profile missing its id", () => {
    expect(
      UpdateProfileParamsSchema.safeParse({
        name: "Default",
        harnessId: "claude" as Profile["harnessId"],
        alias: "default" as Profile["alias"],
        env: {},
      }).success,
    ).toBe(false)
  })
})

describe("UpdateProfileResultSchema", () => {
  it("parses the updated profile", () => {
    expect(UpdateProfileResultSchema.parse(sampleProfile)).toEqual(
      sampleProfile,
    )
  })
})

describe("DeleteProfileParamsSchema", () => {
  it("parses an object carrying the profile id", () => {
    expect(
      DeleteProfileParamsSchema.parse({ id: "prof_default" as ProfileId }),
    ).toEqual({ id: "prof_default" as ProfileId })
  })
  it("rejects extra keys", () => {
    expect(
      DeleteProfileParamsSchema.safeParse({
        id: "prof_default" as ProfileId,
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("DeleteProfileResultSchema", () => {
  it("parses null (void) as the result", () => {
    expect(DeleteProfileResultSchema.parse(null)).toBeNull()
  })
})

describe("PickFolderParamsSchema", () => {
  it("parses omitted params (undefined)", () => {
    expect(PickFolderParamsSchema.parse(undefined)).toBeUndefined()
  })
  it("parses a starting folder hint", () => {
    expect(
      PickFolderParamsSchema.parse({ startingFolder: "/Users/fred" }),
    ).toEqual({ startingFolder: "/Users/fred" })
  })
  it("rejects extra keys", () => {
    expect(
      PickFolderParamsSchema.safeParse({ startingFolder: "/x", extra: 1 })
        .success,
    ).toBe(false)
  })
})

describe("PickFolderResultSchema", () => {
  it("parses a chosen path", () => {
    expect(PickFolderResultSchema.parse({ path: "/Users/fred/app" })).toEqual({
      path: "/Users/fred/app",
    })
  })
  it("parses an empty object (dialog cancelled)", () => {
    expect(PickFolderResultSchema.parse({})).toEqual({})
  })
})

describe("GetSessionScrollbackParamsSchema", () => {
  it("parses an object carrying the session id", () => {
    expect(
      GetSessionScrollbackParamsSchema.parse({ id: "s_1" as SessionId }),
    ).toEqual({ id: "s_1" as SessionId })
  })
  it("rejects extra keys", () => {
    expect(
      GetSessionScrollbackParamsSchema.safeParse({
        id: "s_1" as SessionId,
        extra: 1,
      }).success,
    ).toBe(false)
  })
})

describe("GetSessionScrollbackResultSchema", () => {
  it("parses a base64 byte payload", () => {
    expect(
      GetSessionScrollbackResultSchema.parse({ bytesBase64: "aGk=" }),
    ).toEqual({ bytesBase64: "aGk=" })
  })
  it("rejects a result missing bytesBase64", () => {
    expect(GetSessionScrollbackResultSchema.safeParse({}).success).toBe(false)
  })
})

describe("IpcMethodSchemas", () => {
  it("exposes a params and result schema for every contract method", () => {
    const expected = [
      "getProviders",
      "addProvider",
      "updateProvider",
      "deleteProvider",
      "testProvider",
      "setProviderSecret",
      "getAliases",
      "addAlias",
      "updateAlias",
      "deleteAlias",
      "getHarnesses",
      "addHarness",
      "updateHarness",
      "deleteHarness",
      "launchHarness",
      "getSessions",
      "getProxyStatus",
      "getProfiles",
      "addProfile",
      "updateProfile",
      "deleteProfile",
      "pickFolder",
      "getSessionScrollback",
      "listProviderModels",
    ] as const
    for (const name of expected) {
      expect(IpcMethodSchemas[name]).toBeDefined()
      expect(IpcMethodSchemas[name].params).toBeDefined()
      expect(IpcMethodSchemas[name].result).toBeDefined()
    }
  })
})
