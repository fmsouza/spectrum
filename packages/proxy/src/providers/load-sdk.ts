import type { LoadSdk, SdkModule } from "./factory"

export const loadSdk: LoadSdk = async (sdkProvider): Promise<SdkModule> => {
  switch (sdkProvider) {
    case "openai":
      return { create: (await import("@ai-sdk/openai")).createOpenAI }
    case "anthropic":
      return { create: (await import("@ai-sdk/anthropic")).createAnthropic }
    case "google":
      return {
        create: (await import("@ai-sdk/google")).createGoogleGenerativeAI,
      }
    case "vertex":
      return { create: (await import("@ai-sdk/google-vertex")).createVertex }
    case "bedrock":
      return {
        create: (await import("@ai-sdk/amazon-bedrock")).createAmazonBedrock,
      }
    case "azure":
      return { create: (await import("@ai-sdk/azure")).createAzure }
    case "mistral":
      return { create: (await import("@ai-sdk/mistral")).createMistral }
    case "cohere":
      return { create: (await import("@ai-sdk/cohere")).createCohere }
    case "groq":
      return { create: (await import("@ai-sdk/groq")).createGroq }
    case "xai":
      return { create: (await import("@ai-sdk/xai")).createXai }
    case "fireworks":
      return { create: (await import("@ai-sdk/fireworks")).createFireworks }
    case "perplexity":
      return { create: (await import("@ai-sdk/perplexity")).createPerplexity }
    case "cerebras":
      return { create: (await import("@ai-sdk/cerebras")).createCerebras }
    case "ollama":
      return { create: (await import("ollama-ai-provider-v2")).createOllama }
    case "custom":
      return { create: (await import("@ai-sdk/openai")).createOpenAI }
    case "openrouter":
      return { create: (await import("@ai-sdk/openai")).createOpenAI }
    default:
      throw new Error(`unsupported sdkProvider: ${sdkProvider}`)
  }
}
