import type { ProviderConfig } from "@cline/llms";
import type { ProviderConfigEntry } from "./types";
import type { ProviderCredentials } from "../security/types";
import { ProviderRegistry } from "./registry";
import { Logger } from "../utils/logger";

export interface SdkAdapterOptions {
  registry?: ProviderRegistry;
  logger?: Logger;
}

export class ProviderSdkAdapter {
  private readonly registry: ProviderRegistry;
  private readonly logger: Logger;

  constructor(options: SdkAdapterOptions = {}) {
    this.logger = (options.logger ?? new Logger("sidecar")).child("sdk-adapter");
    this.registry = options.registry ?? new ProviderRegistry(this.logger);
  }

  public async toProviderConfig(
    settings: ProviderConfigEntry,
    credentials?: ProviderCredentials | null
  ): Promise<ProviderConfig> {
    const { providerId, modelId, baseUrl, contextLimits, reasoning, customHeaders, aws } = settings;
    const providerInfo = await this.registry.getProviderInfo(providerId);

    const clientType = (providerInfo?.client ?? "openai-compatible") as ProviderConfig["clientType"];

    const config: ProviderConfig = {
      providerId,
      modelId: modelId || providerInfo?.defaultModelId || "default",
      clientType,
      baseUrl: baseUrl || providerInfo?.baseUrl,
      apiKey: credentials?.apiKey,
      headers: customHeaders,
      maxInputTokens: contextLimits?.maxInputTokens,
      maxOutputTokens: contextLimits?.maxOutputTokens,
      temperature: contextLimits?.temperature,
    };

    if (reasoning) {
      config.thinking = reasoning.enabled;
      config.thinkingBudgetTokens = reasoning.budgetTokens;
      config.reasoningEffort = reasoning.effort as any;
    }

    if (providerId === "bedrock") {
      config.region = aws?.region;
      config.useCrossRegionInference = aws?.useCrossRegionInference;
      config.useGlobalInference = aws?.useGlobalInference;
      config.aws = {
        profile: aws?.profile,
        endpoint: aws?.endpoint,
        authentication: aws?.authentication,
        usePromptCache: aws?.usePromptCache,
        accessKey: credentials?.accessKey,
        secretKey: credentials?.secretKey,
        sessionToken: credentials?.sessionToken,
      };
    }

    return config;
  }
}
