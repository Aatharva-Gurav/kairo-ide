import type { ModelInfo, ProviderInfo } from "@cline/llms";

export interface ProviderContextLimits {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  contextWindow?: number;
  temperature?: number;
}

export interface ProviderReasoningSettings {
  enabled?: boolean;
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  budgetTokens?: number;
}

export interface AwsProviderSettings {
  region?: string;
  accessKey?: string;
  secretKey?: string;
  sessionToken?: string;
  profile?: string;
  authentication?: "iam" | "api-key" | "apikey" | "profile";
  useCrossRegionInference?: boolean;
  useGlobalInference?: boolean;
  usePromptCache?: boolean;
  endpoint?: string;
}

export interface ProviderConfigEntry {
  providerId: string;
  modelId: string;
  baseUrl?: string;
  capabilities?: string[];
  contextLimits?: ProviderContextLimits;
  reasoning?: ProviderReasoningSettings;
  customHeaders?: Record<string, string>;
  aws?: Omit<AwsProviderSettings, "accessKey" | "secretKey" | "sessionToken">;
  updatedAt: number;
}

export interface ProviderSummary {
  id: string;
  name: string;
  description?: string;
  client: string;
  defaultModelId: string;
  selectedModelId: string;
  baseUrl?: string;
  capabilities: string[];
  isConfigured: boolean;
  isActive: boolean;
  hasCustomBaseUrl: boolean;
  contextLimits?: ProviderContextLimits;
  reasoning?: ProviderReasoningSettings;
  updatedAt?: number;
  docsUrl?: string;
}

export interface ConfigureProviderParams {
  providerId: string;
  apiKey?: string;
  modelId?: string;
  baseUrl?: string;
  contextLimits?: ProviderContextLimits;
  reasoning?: ProviderReasoningSettings;
  capabilities?: string[];
  customHeaders?: Record<string, string>;
  aws?: AwsProviderSettings;
  setActive?: boolean;
}

export interface ProviderConnectivityResult {
  ok: boolean;
  providerId: string;
  latencyMs: number;
  modelVerified?: boolean;
  error?: string;
  details?: unknown;
}

export interface ModelListingOptions {
  filter?: "chat";
  fetchLive?: boolean;
}

export type { ModelInfo, ProviderInfo };
