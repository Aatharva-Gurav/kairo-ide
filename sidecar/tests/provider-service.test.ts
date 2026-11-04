import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ProviderService } from "../providers/service";
import { ProviderSettingsStore } from "../providers/settings-store";
import { EncryptedCredentialVault } from "../security/vault";
import { MemorySecretStore } from "../security/keyring";

describe("ProviderService & Model Management", () => {
  let tempDir: string;
  let vaultPath: string;
  let settingsPath: string;
  let memoryStore: MemorySecretStore;
  let vault: EncryptedCredentialVault;
  let settingsStore: ProviderSettingsStore;
  let providerService: ProviderService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `kairo-prov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    vaultPath = path.join(tempDir, "credentials.vault");
    settingsPath = path.join(tempDir, "providers.json");

    memoryStore = new MemorySecretStore();
    vault = new EncryptedCredentialVault({
      vaultFilePath: vaultPath,
      secretStore: memoryStore,
    });
    settingsStore = new ProviderSettingsStore({
      settingsFilePath: settingsPath,
    });

    providerService = new ProviderService({
      vault,
      settingsStore,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("lists all verified providers from SDK catalog without inventing provider IDs", async () => {
    const list = await providerService.listProviders();
    expect(list.length).toBeGreaterThanOrEqual(8);

    const ids = list.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai-native");
    expect(ids).toContain("openai-compatible");
    expect(ids).toContain("gemini");
    expect(ids).toContain("openrouter");
    expect(ids).toContain("mistral");
    expect(ids).toContain("bedrock");
    expect(ids).toContain("ollama");

    // Initially unconfigured
    const anthropic = list.find((p) => p.id === "anthropic")!;
    expect(anthropic.isConfigured).toBe(false);
    expect(anthropic.defaultModelId).toBeDefined();

    // Zero secret leakage check
    for (const p of list) {
      expect((p as unknown as Record<string, unknown>).apiKey).toBeUndefined();
      expect((p as unknown as Record<string, unknown>).secretKey).toBeUndefined();
    }
  });

  it("configures a provider and validates patch-style updates preserve unrelated settings", async () => {
    // 1. Initial configuration
    const initial = await providerService.configureProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-test-key-001",
      modelId: "claude-haiku-5-5",
      baseUrl: "https://custom.anthropic.endpoint/v1",
      contextLimits: { maxOutputTokens: 4096 },
      setActive: true,
    });

    expect(initial.isConfigured).toBe(true);
    expect(initial.isActive).toBe(true);
    expect(initial.selectedModelId).toBe("claude-haiku-5-5");
    expect(initial.baseUrl).toBe("https://custom.anthropic.endpoint/v1");
    expect(initial.contextLimits?.maxOutputTokens).toBe(4096);
    expect((initial as unknown as Record<string, unknown>).apiKey).toBeUndefined();

    // Verify credential stored in vault
    const vaultCreds = await vault.getCredentials("anthropic");
    expect(vaultCreds?.apiKey).toBe("sk-ant-test-key-001");

    // 2. Patch-style update: modify ONLY modelId without passing apiKey or baseUrl
    const patchModel = await providerService.configureProvider({
      providerId: "anthropic",
      modelId: "claude-sonnet-5-5",
    });

    expect(patchModel.selectedModelId).toBe("claude-sonnet-5-5");
    expect(patchModel.baseUrl).toBe("https://custom.anthropic.endpoint/v1"); // baseUrl preserved!
    expect(patchModel.contextLimits?.maxOutputTokens).toBe(4096); // limits preserved!
    expect(patchModel.isConfigured).toBe(true); // credential still in vault!

    const vaultCredsAfterPatch = await vault.getCredentials("anthropic");
    expect(vaultCredsAfterPatch?.apiKey).toBe("sk-ant-test-key-001"); // key preserved!

    // 3. Patch-style update: modify ONLY baseUrl without passing apiKey or modelId
    const patchUrl = await providerService.configureProvider({
      providerId: "anthropic",
      baseUrl: "https://new.anthropic.endpoint/v1",
    });

    expect(patchUrl.baseUrl).toBe("https://new.anthropic.endpoint/v1");
    expect(patchUrl.selectedModelId).toBe("claude-sonnet-5-5"); // model preserved!
    expect(await vault.hasCredentials("anthropic")).toBe(true); // key still intact!
  });

  it("switches active provider and retrieves active provider configuration", async () => {
    await providerService.configureProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-key",
      modelId: "claude-haiku-5-5",
      setActive: true,
    });

    await providerService.configureProvider({
      providerId: "gemini",
      apiKey: "gemini-key",
      modelId: "gemini-3.8-flash",
      setActive: false,
    });

    let active = await providerService.getActiveProvider();
    expect(active?.id).toBe("anthropic");

    // Switch active to gemini
    const switched = await providerService.setActiveProvider("gemini");
    expect(switched.id).toBe("gemini");
    expect(switched.isActive).toBe(true);

    active = await providerService.getActiveProvider();
    expect(active?.id).toBe("gemini");
  });

  it("lists verified models for a supported provider", async () => {
    const anthropicModels = await providerService.listModels("anthropic");
    expect(anthropicModels.length).toBeGreaterThan(0);
    const modelIds = anthropicModels.map((m) => m.id);
    expect(modelIds.some((id) => id.includes("claude"))).toBe(true);

    const geminiModels = await providerService.listModels("gemini");
    expect(geminiModels.length).toBeGreaterThan(0);
    const geminiIds = geminiModels.map((m) => m.id);
    expect(geminiIds.some((id) => id.includes("gemini"))).toBe(true);
  });

  it("removes a provider, deleting credentials from vault and settings from disk", async () => {
    await providerService.configureProvider({
      providerId: "mistral",
      apiKey: "mistral-secret-key",
      modelId: "mistral-large-4",
    });

    expect(await vault.hasCredentials("mistral")).toBe(true);
    expect(await settingsStore.getProvider("mistral")).toBeDefined();

    const removed = await providerService.removeProvider("mistral");
    expect(removed).toBe(true);

    expect(await vault.hasCredentials("mistral")).toBe(false);
    expect(await settingsStore.getProvider("mistral")).toBeUndefined();
  });

  it("rejects unsupported provider IDs cleanly", async () => {
    await expect(
      providerService.configureProvider({
        providerId: "nonexistent-fake-llm",
        apiKey: "fake",
      })
    ).rejects.toThrow("Provider 'nonexistent-fake-llm' is not supported");
  });
});
