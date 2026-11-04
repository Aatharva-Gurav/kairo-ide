import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ConnectionManager, SocketData } from "../server/connection";
import { ProviderService } from "../providers/service";
import { ProviderSettingsStore } from "../providers/settings-store";
import { EncryptedCredentialVault } from "../security/vault";
import { MemorySecretStore } from "../security/keyring";
import { Logger } from "../utils/logger";
import {
  CommandEnvelope,
  ResponseEnvelope,
  HandshakeParams,
  ConfigureProviderParams,
  GetProviderParams,
  SetActiveProviderParams,
  ListProviderModelsParams,
  DeleteProviderParams,
} from "../../lib/ai-agent/types";
import { PROTOCOL_VERSION } from "../../lib/ai-agent/protocol-constants";
import type { ServerWebSocket } from "bun";

class MockServerWebSocket {
  public data: SocketData = {
    id: "test-socket-id",
    connectedAt: Date.now(),
    lastPingAt: Date.now(),
    isAlive: true,
    authenticated: true,
  };
  public sent: string[] = [];

  public send(message: string | Buffer): number {
    this.sent.push(typeof message === "string" ? message : message.toString("utf8"));
    return 1;
  }

  public close(): void {}

  public getResponses(): ResponseEnvelope[] {
    return this.sent.map((s) => JSON.parse(s));
  }

  public getLastResponse<T = unknown>(): ResponseEnvelope<T> {
    if (this.sent.length === 0) {
      throw new Error("No responses recorded");
    }
    return JSON.parse(this.sent[this.sent.length - 1]);
  }

  public clear(): void {
    this.sent = [];
  }
}

describe("Provider Transport RPC Protocol", () => {
  let tempDir: string;
  let vaultPath: string;
  let settingsPath: string;
  let memoryStore: MemorySecretStore;
  let vault: EncryptedCredentialVault;
  let settingsStore: ProviderSettingsStore;
  let providerService: ProviderService;
  let connectionManager: ConnectionManager;
  let mockWs: MockServerWebSocket;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `kairo-rpc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

    const logger = new Logger("test-rpc");
    connectionManager = new ConnectionManager(logger, {
      providerService,
    });

    mockWs = new MockServerWebSocket();
    connectionManager.register(mockWs as unknown as ServerWebSocket<SocketData>);
  });

  afterEach(async () => {
    connectionManager.unregister(mockWs as unknown as ServerWebSocket<SocketData>);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("handles handshake and lists supported verified providers", async () => {
    const handshakeCmd: CommandEnvelope<"handshake", HandshakeParams> = {
      type: "command",
      id: "cmd-handshake-1",
      name: "handshake",
      params: {
        clientVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
      },
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(handshakeCmd));
    const res = mockWs.getLastResponse<{ supportedProviders: string[]; status: string }>();

    expect(res.status).toBe("ok");
    expect(res.id).toBe("cmd-handshake-1");
    if (res.status === "ok") {
      expect(res.result?.status).toBe("ready");
      expect(res.result?.supportedProviders).toContain("anthropic");
      expect(res.result?.supportedProviders).toContain("gemini");
      expect(res.result?.supportedProviders).toContain("openai-native");
      expect(res.result?.supportedProviders).toContain("bedrock");
      expect(res.result?.supportedProviders).toContain("ollama");
    }
  });

  it("handles list_providers with zero secret leakage", async () => {
    // Configure a provider first
    await providerService.configureProvider({
      providerId: "anthropic",
      apiKey: "sk-ant-secret-to-never-leak",
      modelId: "claude-haiku-5-5",
    });

    mockWs.clear();

    const listCmd: CommandEnvelope = {
      type: "command",
      id: "cmd-list-1",
      name: "list_providers",
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(listCmd));
    const res = mockWs.getLastResponse<{ providers: Array<Record<string, unknown>> }>();

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.result?.providers.length).toBeGreaterThanOrEqual(8);
      const anthropic = res.result?.providers.find((p) => p.id === "anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic?.isConfigured).toBe(true);

      // Verify ZERO API keys exist in entire response payload
      const serialized = JSON.stringify(res);
      expect(serialized.includes("sk-ant-secret-to-never-leak")).toBe(false);
      expect(serialized.includes("apiKey")).toBe(false);
    }
  });

  it("handles configure_provider and saves credentials to vault without returning them", async () => {
    const configCmd: CommandEnvelope<"configure_provider", ConfigureProviderParams> = {
      type: "command",
      id: "cmd-config-1",
      name: "configure_provider",
      params: {
        providerId: "gemini",
        apiKey: "AIzaSyTestApiKeyForGemini",
        modelId: "gemini-3.8-flash",
        setActive: true,
      },
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(configCmd));
    const res = mockWs.getLastResponse<{ provider: Record<string, unknown> }>();

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.result?.provider.id).toBe("gemini");
      expect(res.result?.provider.isConfigured).toBe(true);
      expect(res.result?.provider.isActive).toBe(true);
      expect(res.result?.provider.selectedModelId).toBe("gemini-3.8-flash");

      // Verify apiKey was scrubbed from response
      expect(res.result?.provider.apiKey).toBeUndefined();
    }

    // Verify key was saved to vault
    expect(await vault.hasCredentials("gemini")).toBe(true);
    const creds = await vault.getCredentials("gemini");
    expect(creds?.apiKey).toBe("AIzaSyTestApiKeyForGemini");
  });

  it("handles get_provider and list_provider_models", async () => {
    // 1. get_provider
    const getCmd: CommandEnvelope<"get_provider", GetProviderParams> = {
      type: "command",
      id: "cmd-get-1",
      name: "get_provider",
      params: { providerId: "anthropic" },
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(getCmd));
    const getRes = mockWs.getLastResponse<{ summary: Record<string, unknown>; models: Array<{ id: string }> }>();

    expect(getRes.status).toBe("ok");
    if (getRes.status === "ok") {
      expect(getRes.result?.summary.id).toBe("anthropic");
      expect(getRes.result?.models.length).toBeGreaterThan(0);
      expect(getRes.result?.summary.apiKey).toBeUndefined();
    }

    mockWs.clear();

    // 2. list_provider_models
    const modelsCmd: CommandEnvelope<"list_provider_models", ListProviderModelsParams> = {
      type: "command",
      id: "cmd-models-1",
      name: "list_provider_models",
      params: { providerId: "gemini" },
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(modelsCmd));
    const modelsRes = mockWs.getLastResponse<{ models: Array<{ id: string }> }>();

    expect(modelsRes.status).toBe("ok");
    if (modelsRes.status === "ok") {
      expect(modelsRes.result?.models.length).toBeGreaterThan(0);
    }
  });

  it("handles delete_provider cleanly", async () => {
    await providerService.configureProvider({
      providerId: "openrouter",
      apiKey: "sk-or-test-key",
      modelId: "anthropic/claude-sonnet-5.5",
    });

    expect(await vault.hasCredentials("openrouter")).toBe(true);
    mockWs.clear();

    const deleteCmd: CommandEnvelope<"delete_provider", DeleteProviderParams> = {
      type: "command",
      id: "cmd-del-1",
      name: "delete_provider",
      params: { providerId: "openrouter" },
    };

    await connectionManager.handleMessage(mockWs as unknown as ServerWebSocket<SocketData>, JSON.stringify(deleteCmd));
    const res = mockWs.getLastResponse<{ deleted: boolean }>();

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.result?.deleted).toBe(true);
    }

    expect(await vault.hasCredentials("openrouter")).toBe(false);
  });
});
