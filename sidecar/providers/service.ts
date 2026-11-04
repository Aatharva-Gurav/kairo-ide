import type {
  ConfigureProviderParams,
  ModelInfo,
  ModelListingOptions,
  ProviderConnectivityResult,
  ProviderSummary,
} from "./types";
import { ProviderRegistry } from "./registry";
import { ProviderSettingsStore } from "./settings-store";
import { EncryptedCredentialVault } from "../security/vault";
import { ProviderSdkAdapter } from "./sdk-adapter";
import { ProviderConnectivityTester } from "./connectivity";
import { Logger } from "../utils/logger";
import { SidecarError, ERROR_CODES } from "../server/error";
import type { ProviderConfig } from "@cline/llms";

export interface ProviderServiceOptions {
  registry?: ProviderRegistry;
  settingsStore?: ProviderSettingsStore;
  vault?: EncryptedCredentialVault;
  sdkAdapter?: ProviderSdkAdapter;
  connectivityTester?: ProviderConnectivityTester;
  logger?: Logger;
}

export class ProviderService {
  private readonly registry: ProviderRegistry;
  private readonly settingsStore: ProviderSettingsStore;
  private readonly vault: EncryptedCredentialVault;
  private readonly sdkAdapter: ProviderSdkAdapter;
  private readonly connectivityTester: ProviderConnectivityTester;
  private readonly logger: Logger;

  constructor(options: ProviderServiceOptions = {}) {
    this.logger = (options.logger ?? new Logger("sidecar")).child("provider-service");
    this.registry = options.registry ?? new ProviderRegistry(this.logger);
    this.settingsStore = options.settingsStore ?? new ProviderSettingsStore({ logger: this.logger });
    this.vault = options.vault ?? new EncryptedCredentialVault({ logger: this.logger });
    this.sdkAdapter = options.sdkAdapter ?? new ProviderSdkAdapter({ registry: this.registry, logger: this.logger });
    this.connectivityTester =
      options.connectivityTester ?? new ProviderConnectivityTester(this.logger);
  }

  public async listProviders(): Promise<ProviderSummary[]> {
    const verified = await this.registry.getVerifiedProviders();
    const storedSettings = await this.settingsStore.readSettings();
    const activeProviderId = storedSettings.activeProviderId;
    const summaries: ProviderSummary[] = [];

    for (const info of verified) {
      const stored = storedSettings.providers[info.id];
      const hasCreds = await this.vault.hasCredentials(info.id);
      // Ollama doesn't strictly require credentials
      const isConfigured = hasCreds || info.id === "ollama";
      const selectedModelId = stored?.modelId || info.defaultModelId || "default";

      summaries.push({
        id: info.id,
        name: info.name,
        description: info.description,
        client: info.client,
        defaultModelId: info.defaultModelId || "default",
        selectedModelId,
        baseUrl: stored?.baseUrl || info.baseUrl,
        capabilities: (info.capabilities || []).map(String),
        isConfigured,
        isActive: activeProviderId === info.id,
        hasCustomBaseUrl: Boolean(stored?.baseUrl && stored.baseUrl !== info.baseUrl),
        contextLimits: stored?.contextLimits,
        reasoning: stored?.reasoning,
        updatedAt: stored?.updatedAt,
        docsUrl: info.docsUrl,
      });
    }

    return summaries;
  }

  public async getProvider(providerId: string): Promise<{
    summary: ProviderSummary;
    models: ModelInfo[];
  }> {
    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    const info = await this.registry.getProviderInfo(providerId);
    if (!info) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider metadata not found for '${providerId}'.`
      );
    }

    const stored = await this.settingsStore.getProvider(providerId);
    const activeId = await this.settingsStore.getActiveProviderId();
    const hasCreds = await this.vault.hasCredentials(providerId);
    const isConfigured = hasCreds || providerId === "ollama";
    const selectedModelId = stored?.modelId || info.defaultModelId || "default";

    const summary: ProviderSummary = {
      id: info.id,
      name: info.name,
      description: info.description,
      client: info.client,
      defaultModelId: info.defaultModelId || "default",
      selectedModelId,
      baseUrl: stored?.baseUrl || info.baseUrl,
      capabilities: (info.capabilities || []).map(String),
      isConfigured,
      isActive: activeId === info.id,
      hasCustomBaseUrl: Boolean(stored?.baseUrl && stored.baseUrl !== info.baseUrl),
      contextLimits: stored?.contextLimits,
      reasoning: stored?.reasoning,
      updatedAt: stored?.updatedAt,
      docsUrl: info.docsUrl,
    };

    const modelsMap = await this.registry.getModelsForProvider(providerId);
    const models = Object.values(modelsMap);

    return { summary, models };
  }

  public async configureProvider(params: ConfigureProviderParams): Promise<ProviderSummary> {
    const { providerId, apiKey, modelId, baseUrl, contextLimits, reasoning, capabilities, customHeaders, aws, setActive } = params;

    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    // 1. Update Vault if credentials are provided (Patch-style: if undefined, leave existing untouched)
    if (apiKey !== undefined) {
      if (apiKey.trim().length > 0) {
        await this.vault.setCredentials(providerId, { apiKey: apiKey.trim() });
      } else {
        // Empty string means clear the API key
        await this.vault.deleteCredentials(providerId);
      }
    }

    if (aws) {
      const awsCreds: Record<string, string> = {};
      if (aws.accessKey) awsCreds.accessKey = aws.accessKey.trim();
      if (aws.secretKey) awsCreds.secretKey = aws.secretKey.trim();
      if (aws.sessionToken) awsCreds.sessionToken = aws.sessionToken.trim();
      if (Object.keys(awsCreds).length > 0) {
        await this.vault.setCredentials(providerId, awsCreds);
      }
    }

    // 2. Update non-secret settings in ProviderSettingsStore (Patch-style)
    const existingEntry = await this.settingsStore.getProvider(providerId);
    const updatedModelId = modelId ?? existingEntry?.modelId;

    // Verify model compatibility if modelId is specified
    if (modelId) {
      const models = await this.registry.getModelsForProvider(providerId);
      if (Object.keys(models).length > 0 && !models[modelId]) {
        // Log warning for unrecognized model ID, but allow for flexible custom endpoints
        this.logger.warn(
          `Model '${modelId}' not found in bundled catalog for provider '${providerId}'. It will be used as custom model.`
        );
      }
    }

    await this.settingsStore.setProvider(providerId, {
      modelId: updatedModelId,
      baseUrl: baseUrl !== undefined ? baseUrl : existingEntry?.baseUrl,
      contextLimits,
      reasoning,
      capabilities,
      customHeaders,
      aws: aws
        ? {
            region: aws.region,
            profile: aws.profile,
            endpoint: aws.endpoint,
            authentication: aws.authentication,
            useCrossRegionInference: aws.useCrossRegionInference,
            useGlobalInference: aws.useGlobalInference,
            usePromptCache: aws.usePromptCache,
          }
        : existingEntry?.aws,
    });

    // 3. Update active provider status if requested
    if (setActive === true) {
      await this.settingsStore.setActiveProviderId(providerId);
    } else {
      // If no active provider exists yet, make this one active
      const currentActive = await this.settingsStore.getActiveProviderId();
      if (!currentActive) {
        await this.settingsStore.setActiveProviderId(providerId);
      }
    }

    const { summary } = await this.getProvider(providerId);
    this.logger.info(`Configured provider '${providerId}' (model: ${summary.selectedModelId})`);
    return summary;
  }

  public async removeProvider(providerId: string): Promise<boolean> {
    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    // Delete credentials from vault
    await this.vault.deleteCredentials(providerId);

    // Delete configuration from settings store
    const removed = await this.settingsStore.removeProvider(providerId);

    this.logger.info(`Removed provider configuration and credentials for '${providerId}'`);
    return removed;
  }

  public async setActiveProvider(providerId: string): Promise<ProviderSummary> {
    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    const hasCreds = await this.vault.hasCredentials(providerId);
    if (!hasCreds && providerId !== "ollama") {
      throw new SidecarError(
        ERROR_CODES.ERR_AUTH_FAILED,
        `Cannot set '${providerId}' as active: no credentials configured.`
      );
    }

    await this.settingsStore.setActiveProviderId(providerId);
    const { summary } = await this.getProvider(providerId);
    this.logger.info(`Active provider set to '${providerId}'`);
    return summary;
  }

  public async getActiveProvider(): Promise<ProviderSummary | null> {
    const activeId = await this.settingsStore.getActiveProviderId();
    if (!activeId) {
      // Find first configured provider
      const summaries = await this.listProviders();
      const firstConfigured = summaries.find((s) => s.isConfigured);
      if (firstConfigured) {
        await this.settingsStore.setActiveProviderId(firstConfigured.id);
        return { ...firstConfigured, isActive: true };
      }
      return null;
    }

    const { summary } = await this.getProvider(activeId);
    return summary;
  }

  public async listModels(
    providerId: string,
    options?: ModelListingOptions
  ): Promise<ModelInfo[]> {
    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    const modelsMap = await this.registry.getModelsForProvider(providerId, {
      filter: options?.filter,
    });
    return Object.values(modelsMap);
  }

  public async validateCredentials(
    providerId: string,
    credentialsOverride?: { apiKey?: string; baseUrl?: string }
  ): Promise<ProviderConnectivityResult> {
    if (!ProviderRegistry.isSupportedProvider(providerId)) {
      throw new SidecarError(
        ERROR_CODES.ERR_NOT_FOUND,
        `Provider '${providerId}' is not supported.`
      );
    }

    let apiKey = credentialsOverride?.apiKey;
    if (!apiKey) {
      const creds = await this.vault.getCredentials(providerId);
      apiKey = creds?.apiKey;
    }

    if (!apiKey && providerId !== "ollama") {
      return {
        ok: false,
        providerId,
        latencyMs: 0,
        error: `No API key provided or found for provider '${providerId}'.`,
      };
    }

    const stored = await this.settingsStore.getProvider(providerId);
    const baseUrl = credentialsOverride?.baseUrl || stored?.baseUrl;

    return this.connectivityTester.testConnectivity({
      providerId,
      apiKey,
      baseUrl,
    });
  }

  public async testConnectivity(providerId: string): Promise<ProviderConnectivityResult> {
    return this.validateCredentials(providerId);
  }

  public async resolveActiveProviderConfig(): Promise<ProviderConfig> {
    let activeId = await this.settingsStore.getActiveProviderId();
    if (!activeId) {
      const activeSummary = await this.getActiveProvider();
      if (!activeSummary) {
        throw new SidecarError(
          ERROR_CODES.ERR_PROVIDER_NOT_CONFIGURED,
          "No AI provider is currently configured. Please configure an AI provider in settings."
        );
      }
      activeId = activeSummary.id;
    }

    let stored = await this.settingsStore.getProvider(activeId);
    if (!stored) {
      const info = await this.registry.getProviderInfo(activeId);
      stored = {
        providerId: activeId,
        modelId: info?.defaultModelId || "default",
        baseUrl: info?.baseUrl,
        updatedAt: Date.now(),
      };
    }

    const creds = await this.vault.getCredentials(activeId);
    return this.sdkAdapter.toProviderConfig(stored, creds);
  }

  public getVault(): EncryptedCredentialVault {
    return this.vault;
  }

  public getSettingsStore(): ProviderSettingsStore {
    return this.settingsStore;
  }
}
