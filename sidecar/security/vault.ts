import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  EncryptedVaultEnvelope,
  ICredentialVault,
  IOsSecretStore,
  ProviderCredentials,
} from "./types";
import { resolveOsSecretStore } from "./keyring";
import { Logger } from "../utils/logger";

const VAULT_SERVICE_NAME = "kairo-ide";
const VAULT_MASTER_KEY_ACCOUNT = "master-vault-key";
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32; // 256 bits
const PBKDF2_DIGEST = "sha256";

export interface EncryptedVaultOptions {
  vaultFilePath?: string;
  secretStore?: IOsSecretStore;
  logger?: Logger;
}

export class EncryptedCredentialVault implements ICredentialVault {
  private readonly vaultFilePath: string;
  private readonly secretStorePromise: Promise<IOsSecretStore>;
  private readonly logger: Logger;
  private masterKeyCache: string | null = null;

  constructor(options: EncryptedVaultOptions = {}) {
    this.logger = (options.logger ?? new Logger("sidecar")).child("credential-vault");
    this.vaultFilePath =
      options.vaultFilePath ??
      path.join(os.homedir(), ".kairo", "security", "credentials.vault");

    if (options.secretStore) {
      this.secretStorePromise = Promise.resolve(options.secretStore);
    } else {
      this.secretStorePromise = resolveOsSecretStore(this.logger);
    }
  }

  private async getMasterKey(): Promise<string> {
    if (this.masterKeyCache) {
      return this.masterKeyCache;
    }

    // Check environment variable override (for headless CI / automated tests)
    if (process.env.KAIRO_VAULT_KEY) {
      this.masterKeyCache = process.env.KAIRO_VAULT_KEY;
      return this.masterKeyCache;
    }

    const store = await this.secretStorePromise;
    let masterKey = await store.getSecret(VAULT_SERVICE_NAME, VAULT_MASTER_KEY_ACCOUNT);

    if (!masterKey) {
      this.logger.info(
        `Generating new 256-bit vault master key protected by ${store.getStoreName()}...`
      );
      masterKey = crypto.randomBytes(32).toString("hex");
      await store.setSecret(VAULT_SERVICE_NAME, VAULT_MASTER_KEY_ACCOUNT, masterKey);
    }

    this.masterKeyCache = masterKey;
    return masterKey;
  }

  private deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEYLEN,
      PBKDF2_DIGEST
    );
  }

  private async readVaultData(): Promise<Record<string, ProviderCredentials>> {
    try {
      const raw = await fs.readFile(this.vaultFilePath, "utf8");
      const envelope: EncryptedVaultEnvelope = JSON.parse(raw);

      if (envelope.version !== 1) {
        throw new Error(`Unsupported vault version: ${envelope.version}`);
      }

      const masterKey = await this.getMasterKey();
      const salt = Buffer.from(envelope.salt, "hex");
      const iv = Buffer.from(envelope.iv, "hex");
      const authTag = Buffer.from(envelope.authTag, "hex");
      const ciphertext = Buffer.from(envelope.ciphertext, "hex");

      const aesKey = this.deriveKey(masterKey, salt);
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      const jsonStr = decrypted.toString("utf8");
      return JSON.parse(jsonStr);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error && error.code === "ENOENT") {
        // Vault file doesn't exist yet
        return {};
      }
      this.logger.error("Failed to decrypt or parse credential vault", err);
      throw new Error(`Vault decryption error: ${(err as Error).message}`);
    }
  }

  private async writeVaultData(data: Record<string, ProviderCredentials>): Promise<void> {
    const masterKey = await this.getMasterKey();
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12); // 96-bit recommended for GCM
    const aesKey = this.deriveKey(masterKey, salt);

    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const plaintext = Buffer.from(JSON.stringify(data), "utf8");

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope: EncryptedVaultEnvelope = {
      version: 1,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      ciphertext: ciphertext.toString("hex"),
      updatedAt: Date.now(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.vaultFilePath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write via temp file
    const tempPath = `${this.vaultFilePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(envelope, null, 2), {
      encoding: "utf8",
      mode: 0o600, // Read/write by owner only
    });

    await fs.rename(tempPath, this.vaultFilePath);
  }

  public async getCredentials(providerId: string): Promise<ProviderCredentials | null> {
    const data = await this.readVaultData();
    return data[providerId] ?? null;
  }

  public async setCredentials(
    providerId: string,
    credentials: ProviderCredentials
  ): Promise<void> {
    const data = await this.readVaultData();
    // Merge credentials if some are already present
    const existing = data[providerId] ?? {};
    data[providerId] = {
      ...existing,
      ...credentials,
    };
    await this.writeVaultData(data);
  }

  public async deleteCredentials(providerId: string): Promise<boolean> {
    const data = await this.readVaultData();
    if (providerId in data) {
      delete data[providerId];
      await this.writeVaultData(data);
      return true;
    }
    return false;
  }

  public async hasCredentials(providerId: string): Promise<boolean> {
    const creds = await this.getCredentials(providerId);
    if (!creds) return false;
    // Check if at least one meaningful credential is non-empty
    return Boolean(
      (creds.apiKey && creds.apiKey.trim().length > 0) ||
      (creds.accessKey && creds.accessKey.trim().length > 0) ||
      (creds.accessToken && creds.accessToken.trim().length > 0)
    );
  }

  public async listConfiguredProviderIds(): Promise<string[]> {
    const data = await this.readVaultData();
    return Object.keys(data);
  }

  public async clearAll(): Promise<void> {
    try {
      await fs.unlink(this.vaultFilePath);
    } catch {
      // Ignore if doesn't exist
    }
  }

  public getVaultPath(): string {
    return this.vaultFilePath;
  }
}
