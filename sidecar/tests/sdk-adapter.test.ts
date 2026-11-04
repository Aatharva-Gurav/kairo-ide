import { describe, it, expect } from "vitest";
import { ProviderSdkAdapter } from "../providers/sdk-adapter";
import type { ProviderConfigEntry } from "../providers/types";

describe("ProviderSdkAdapter", () => {
  const adapter = new ProviderSdkAdapter();

  it("translates Anthropic settings and credentials into exact SDK ProviderConfig", async () => {
    const entry: ProviderConfigEntry = {
      providerId: "anthropic",
      modelId: "claude-haiku-5-5",
      baseUrl: "https://api.anthropic.com/v1",
      contextLimits: {
        maxInputTokens: 100000,
        maxOutputTokens: 8192,
        temperature: 0.5,
      },
      reasoning: {
        enabled: true,
        effort: "high",
        budgetTokens: 4096,
      },
      updatedAt: Date.now(),
    };

    const credentials = {
      apiKey: "sk-ant-test-key-999",
    };

    const sdkConfig = await adapter.toProviderConfig(entry, credentials);

    expect(sdkConfig.providerId).toBe("anthropic");
    expect(sdkConfig.modelId).toBe("claude-haiku-5-5");
    expect(sdkConfig.clientType).toBe("anthropic");
    expect(sdkConfig.apiKey).toBe("sk-ant-test-key-999");
    expect(sdkConfig.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(sdkConfig.maxInputTokens).toBe(100000);
    expect(sdkConfig.maxOutputTokens).toBe(8192);
    expect(sdkConfig.temperature).toBe(0.5);
    expect(sdkConfig.thinking).toBe(true);
    expect(sdkConfig.thinkingBudgetTokens).toBe(4096);
    expect(sdkConfig.reasoningEffort).toBe("high");
  });

  it("translates AWS Bedrock settings and credentials with correct nested structure", async () => {
    const entry: ProviderConfigEntry = {
      providerId: "bedrock",
      modelId: "anthropic.claude-haiku-5-5",
      aws: {
        region: "us-west-2",
        authentication: "iam",
        useCrossRegionInference: true,
      },
      updatedAt: Date.now(),
    };

    const credentials = {
      accessKey: "AKIA_AWS_ACCESS_KEY",
      secretKey: "AWS_SECRET_ACCESS_KEY",
      sessionToken: "AWS_SESSION_TOKEN",
    };

    const sdkConfig = await adapter.toProviderConfig(entry, credentials);

    expect(sdkConfig.providerId).toBe("bedrock");
    expect(sdkConfig.clientType).toBe("bedrock");
    expect(sdkConfig.region).toBe("us-west-2");
    expect(sdkConfig.useCrossRegionInference).toBe(true);
    expect(sdkConfig.aws).toBeDefined();
    expect(sdkConfig.aws?.accessKey).toBe("AKIA_AWS_ACCESS_KEY");
    expect(sdkConfig.aws?.secretKey).toBe("AWS_SECRET_ACCESS_KEY");
    expect(sdkConfig.aws?.sessionToken).toBe("AWS_SESSION_TOKEN");
    expect(sdkConfig.aws?.authentication).toBe("iam");
  });

  it("falls back to catalog default model when modelId is not specified", async () => {
    const entry: ProviderConfigEntry = {
      providerId: "openai-native",
      modelId: "",
      updatedAt: Date.now(),
    };

    const sdkConfig = await adapter.toProviderConfig(entry, { apiKey: "sk-openai" });
    expect(sdkConfig.providerId).toBe("openai-native");
    expect(sdkConfig.clientType).toBe("openai");
    expect(sdkConfig.modelId).toBeDefined();
    expect(sdkConfig.modelId.length).toBeGreaterThan(0);
    expect(sdkConfig.apiKey).toBe("sk-openai");
  });
});
