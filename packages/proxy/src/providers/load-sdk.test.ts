import { describe, expect, it } from "bun:test"
import { loadSdk } from "./load-sdk"

describe("loadSdk", () => {
  it("loads an SDK module for custom (OpenAI-compatible)", async () => {
    const mod = await loadSdk("custom")
    expect(typeof mod.create).toBe("function")
  })

  it("loads an SDK module for openrouter (OpenAI-compatible)", async () => {
    const mod = await loadSdk("openrouter")
    expect(typeof mod.create).toBe("function")
  })

  it("loads an SDK module for ollama (cloud)", async () => {
    const mod = await loadSdk("ollama")
    expect(typeof mod.create).toBe("function")
  })
})
