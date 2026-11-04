import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { EncryptedCredentialVault } from "../security/vault";
import { MemorySecretStore } from "../security/keyring";

describe("Secure Credential Storage & Vault", () => {
  let tempDir: string;
  let vaultPath: string;
  let memoryStore: MemorySecretStore;
  let vault: EncryptedCredentialVault;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `kairo-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    vaultPath = path.join(tempDir, "test.vault");
    memoryStore = new MemorySecretStore();
    vault = new EncryptedCredentialVault({
      vaultFilePath: vaultPath,
      secretStore: memoryStore,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("stores and retrieves credentials securely", async () => {
    await vault.setCredentials("anthropic", { apiKey: "sk-ant-test-super-secret-key-12345" });

    const retrieved = await vault.getCredentials("anthropic");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.apiKey).toBe("sk-ant-test-super-secret-key-12345");
  });

  it("ensures credentials on disk are strictly encrypted with AES-256-GCM and contain zero plaintext", async () => {
    const secretKey = "sk-ant-super-confidential-secret-key-xyz-98765";
    await vault.setCredentials("anthropic", { apiKey: secretKey });

    const rawDiskContent = await fs.readFile(vaultPath, "utf8");
    expect(rawDiskContent.includes(secretKey)).toBe(false);
    expect(rawDiskContent.includes("sk-ant")).toBe(false);

    const envelope = JSON.parse(rawDiskContent);
    expect(envelope.version).toBe(1);
    expect(envelope.salt).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.authTag).toBeDefined();
    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.salt.length).toBe(32); // 16 bytes hex
    expect(envelope.iv.length).toBe(24); // 12 bytes hex
    expect(envelope.authTag.length).toBe(32); // 16 bytes hex
  });

  it("supports patch-style credential updates across multiple providers", async () => {
    await vault.setCredentials("anthropic", { apiKey: "key-anthropic" });
    await vault.setCredentials("openai-native", { apiKey: "key-openai" });
    await vault.setCredentials("bedrock", {
      accessKey: "AKIA123",
      secretKey: "secret-aws-key",
      sessionToken: "session-token-abc",
    });

    const anthropicCreds = await vault.getCredentials("anthropic");
    const openaiCreds = await vault.getCredentials("openai-native");
    const bedrockCreds = await vault.getCredentials("bedrock");

    expect(anthropicCreds?.apiKey).toBe("key-anthropic");
    expect(openaiCreds?.apiKey).toBe("key-openai");
    expect(bedrockCreds?.accessKey).toBe("AKIA123");
    expect(bedrockCreds?.secretKey).toBe("secret-aws-key");
    expect(bedrockCreds?.sessionToken).toBe("session-token-abc");

    // Patch update bedrock without erasing existing accessKey
    await vault.setCredentials("bedrock", { sessionToken: "new-session-token" });
    const updatedBedrock = await vault.getCredentials("bedrock");
    expect(updatedBedrock?.accessKey).toBe("AKIA123");
    expect(updatedBedrock?.secretKey).toBe("secret-aws-key");
    expect(updatedBedrock?.sessionToken).toBe("new-session-token");
  });

  it("correctly identifies configured credentials with hasCredentials", async () => {
    expect(await vault.hasCredentials("gemini")).toBe(false);

    await vault.setCredentials("gemini", { apiKey: "AIzaSyTestKey123" });
    expect(await vault.hasCredentials("gemini")).toBe(true);

    await vault.setCredentials("gemini", { apiKey: "   " });
    expect(await vault.hasCredentials("gemini")).toBe(false);
  });

  it("deletes provider credentials cleanly", async () => {
    await vault.setCredentials("openrouter", { apiKey: "sk-or-v1-secret" });
    expect(await vault.hasCredentials("openrouter")).toBe(true);

    const deleted = await vault.deleteCredentials("openrouter");
    expect(deleted).toBe(true);
    expect(await vault.hasCredentials("openrouter")).toBe(false);
    expect(await vault.getCredentials("openrouter")).toBeNull();
  });

  it("fails gracefully when vault file is corrupted or tampered with", async () => {
    await vault.setCredentials("anthropic", { apiKey: "secret" });

    // Tamper with ciphertext
    const raw = await fs.readFile(vaultPath, "utf8");
    const envelope = JSON.parse(raw);
    envelope.ciphertext = envelope.ciphertext.slice(0, -4) + "ffff";
    await fs.writeFile(vaultPath, JSON.stringify(envelope));

    // Decryption must throw an authentication error
    await expect(vault.getCredentials("anthropic")).rejects.toThrow("Vault decryption error");
  });
});
