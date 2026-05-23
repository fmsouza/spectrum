import { describe, expect, it } from "bun:test"
import type { AliasName, HarnessId, ProviderId } from "@launchkit/types"
import {
  AddProviderParamsSchema,
  GetSessionsParamsSchema,
  IpcMethodSchemas,
  LaunchHarnessParamsSchema,
  SetProviderSecretParamsSchema,
} from "./methods"

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
    ] as const
    for (const name of expected) {
      expect(IpcMethodSchemas[name]).toBeDefined()
      expect(IpcMethodSchemas[name].params).toBeDefined()
      expect(IpcMethodSchemas[name].result).toBeDefined()
    }
  })
})
