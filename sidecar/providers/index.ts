import { BUILT_IN_PROVIDER_IDS } from "@cline/sdk";

export interface ResolvedProviderSettings {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export const SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai-compatible",
  "openai-native",
  "openrouter",
  "ollama",
  "gemini",
  "deepseek",
  "groq",
] as const;

export class ProviderManager {
  public static isSupported(providerId: string): boolean {
    return (
      SUPPORTED_PROVIDERS.includes(providerId as (typeof SUPPORTED_PROVIDERS)[number]) ||
      BUILT_IN_PROVIDER_IDS.includes(providerId as (typeof BUILT_IN_PROVIDER_IDS)[number])
    );
  }

  public static resolveSettings(params: {
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  }): ResolvedProviderSettings {
    const providerId = params.providerId || "anthropic";
    const modelId =
      params.modelId ||
      (providerId === "anthropic" ? "claude-3-7-sonnet-20250219" : "gpt-4o");

    return {
      providerId,
      modelId,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
    };
  }
}
