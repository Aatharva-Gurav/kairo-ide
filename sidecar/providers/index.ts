export * from "./types";
export * from "./registry";
export * from "./settings-store";
export * from "./connectivity";
export * from "./sdk-adapter";
export * from "./service";

// Backward compatibility helper for existing code
import { ProviderRegistry } from "./registry";

export class ProviderManager {
  public static isSupported(providerId: string): boolean {
    return ProviderRegistry.isSupportedProvider(providerId);
  }

  public static resolveSettings(params: {
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
  }) {
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
