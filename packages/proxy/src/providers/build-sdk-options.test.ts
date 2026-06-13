import { describe, expect, it } from "bun:test"
import { getDescriptor } from "@spectrum/providers"
import { buildSdkOptions } from "./build-sdk-options"

describe("buildSdkOptions", () => {
  it("sets baseURL from serverUrl and passes apiKey as an option for custom", () => {
    const opts = buildSdkOptions(
      getDescriptor("custom"),
      { serverUrl: "http://localhost:11434/v1" },
      { apiKey: "sk-test" },
    )
    expect(opts).toEqual({
      baseURL: "http://localhost:11434/v1",
      apiKey: "sk-test",
    })
  })

  it("merges JSON custom headers for custom", () => {
    const opts = buildSdkOptions(
      getDescriptor("custom"),
      { headers: '{"X-Org":"acme"}' },
      {},
    )
    expect(opts).toEqual({ headers: { "X-Org": "acme" } })
  })

  it("injects the ollama cloud api key as an Authorization Bearer header", () => {
    const opts = buildSdkOptions(
      getDescriptor("ollama"),
      {},
      { apiKey: "k123" },
    )
    expect(opts).toEqual({
      baseURL: "https://ollama.com/api",
      headers: { Authorization: "Bearer k123" },
    })
  })

  it("maps openrouter attribution fields to headers and apiKey to an option", () => {
    const opts = buildSdkOptions(
      getDescriptor("openrouter"),
      { httpReferer: "https://app.example", appTitle: "My App" },
      { apiKey: "or-1" },
    )
    expect(opts).toEqual({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "or-1",
      headers: { "HTTP-Referer": "https://app.example", "X-Title": "My App" },
    })
  })

  it("passes non-apiKey secrets and scalar config through as options (bedrock)", () => {
    const opts = buildSdkOptions(
      getDescriptor("bedrock"),
      { region: "us-east-1" },
      { accessKeyId: "AKIA", secretAccessKey: "shh" },
    )
    expect(opts).toEqual({
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "shh",
    })
  })
})
