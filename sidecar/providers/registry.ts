import {
  BUILT_IN_PROVIDER_IDS,
  getAllProviders,
  getModelsForProvider,
  getProvider,
  type BuiltInProviderId,
  type ModelInfo,
  type ProviderInfo,
} from "@cline/llms";
import { Logger } from "../utils/logger";

export const VERIFIED_PROVIDER_IDS = [
  "anthropic",
  "openai-native",
  "openai-compatible",
  "gemini",
  "openrouter",
  "mistral",
  "bedrock",
  "ollama",
  "deepseek",
  "groq",
  "lmstudio",
] as const;

export type VerifiedProviderId = (typeof VERIFIED_PROVIDER_IDS)[number];

export class ProviderRegistry {
  private static cachedProviders: Map<string, ProviderInfo> = new Map();
  private static cachedModels: Map<string, Record<string, ModelInfo>> = new Map();
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? new Logger("sidecar")).child("provider-registry");
  }

  public static isSupportedProvider(id: string): boolean {
    return (
      VERIFIED_PROVIDER_IDS.includes(id as VerifiedProviderId) ||
      BUILT_IN_PROVIDER_IDS.includes(id as BuiltInProviderId)
    );
  }

  public async getProviderInfo(providerId: string): Promise<ProviderInfo | undefined> {
    if (ProviderRegistry.cachedProviders.has(providerId)) {
      return ProviderRegistry.cachedProviders.get(providerId);
    }

    try {
      const info = await getProvider(providerId);
      if (info) {
        ProviderRegistry.cachedProviders.set(providerId, info);
      }
      return info;
    } catch (err) {
      this.logger.warn(`Failed to fetch provider info for '${providerId}'`, err);
      return undefined;
    }
  }

  public async getVerifiedProviders(): Promise<ProviderInfo[]> {
    const list: ProviderInfo[] = [];
    for (const id of VERIFIED_PROVIDER_IDS) {
      const info = await this.getProviderInfo(id);
      if (info) {
        list.push(info);
      }
    }
    return list;
  }

  public async getAllKnownProviders(): Promise<ProviderInfo[]> {
    try {
      const all = await getAllProviders();
      return all;
    } catch (err) {
      this.logger.warn("Failed to fetch all providers from catalog, falling back to verified", err);
      return this.getVerifiedProviders();
    }
  }

  public async getModelsForProvider(
    providerId: string,
    options?: { filter?: "chat"; bypassCache?: boolean }
  ): Promise<Record<string, ModelInfo>> {
    if (!options?.bypassCache && ProviderRegistry.cachedModels.has(providerId)) {
      return ProviderRegistry.cachedModels.get(providerId)!;
    }

    try {
      const models = await getModelsForProvider(providerId, { filter: options?.filter });
      if (models && Object.keys(models).length > 0) {
        ProviderRegistry.cachedModels.set(providerId, models);
        return models;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch models for provider '${providerId}' from catalog`, err);
    }

    // Fallback for local runtime providers like Ollama / LM Studio if no models bundled
    if (providerId === "ollama") {
      const defaultOllama: Record<string, ModelInfo> = {
        default: {
          id: "default",
          name: "Default (Active Ollama Model)",
          contextWindow: 128000,
          maxTokens: 8192,
          capabilities: ["tools", "streaming"],
        },
      };
      return defaultOllama;
    }

    return {};
  }

  public async getModelInfo(
    providerId: string,
    modelId: string
  ): Promise<ModelInfo | undefined> {
    const models = await this.getModelsForProvider(providerId);
    return models[modelId];
  }

  public clearCache(): void {
    ProviderRegistry.cachedProviders.clear();
    ProviderRegistry.cachedModels.clear();
  }
}
