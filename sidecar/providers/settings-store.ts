import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ProviderConfigEntry } from "./types";
import { Logger } from "../utils/logger";

export interface StoredProviderSettingsFile {
  version: 1;
  activeProviderId?: string;
  providers: Record<string, ProviderConfigEntry>;
}

export interface ProviderSettingsStoreOptions {
  settingsFilePath?: string;
  logger?: Logger;
}

export class ProviderSettingsStore {
  private readonly filePath: string;
  private readonly logger: Logger;
  private inMemoryCache: StoredProviderSettingsFile | null = null;

  constructor(options: ProviderSettingsStoreOptions = {}) {
    this.logger = (options.logger ?? new Logger("sidecar")).child("provider-settings-store");
    this.filePath =
      options.settingsFilePath ??
      path.join(os.homedir(), ".kairo", "settings", "providers.json");
  }

  public async readSettings(): Promise<StoredProviderSettingsFile> {
    if (this.inMemoryCache) {
      return this.inMemoryCache;
    }

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      const parsed: StoredProviderSettingsFile = JSON.parse(content);
      if (parsed.version !== 1) {
        throw new Error(`Unsupported provider settings file version: ${parsed.version}`);
      }
      this.inMemoryCache = parsed;
      return parsed;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error && error.code === "ENOENT") {
        const initial: StoredProviderSettingsFile = {
          version: 1,
          activeProviderId: undefined,
          providers: {},
        };
        this.inMemoryCache = initial;
        return initial;
      }
      this.logger.error("Failed to read provider settings file", err);
      throw err;
    }
  }

  public async writeSettings(settings: StoredProviderSettingsFile): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), {
      encoding: "utf8",
    });

    await fs.rename(tempPath, this.filePath);
    this.inMemoryCache = settings;
  }

  public async getProvider(providerId: string): Promise<ProviderConfigEntry | undefined> {
    const settings = await this.readSettings();
    return settings.providers[providerId];
  }

  public async setProvider(
    providerId: string,
    entry: Partial<ProviderConfigEntry>
  ): Promise<ProviderConfigEntry> {
    const settings = await this.readSettings();
    const existing = settings.providers[providerId];

    const merged: ProviderConfigEntry = {
      providerId,
      modelId: entry.modelId ?? existing?.modelId ?? "default",
      baseUrl: entry.baseUrl !== undefined ? entry.baseUrl : existing?.baseUrl,
      capabilities: entry.capabilities ?? existing?.capabilities,
      contextLimits: entry.contextLimits
        ? { ...(existing?.contextLimits ?? {}), ...entry.contextLimits }
        : existing?.contextLimits,
      reasoning: entry.reasoning
        ? { ...(existing?.reasoning ?? {}), ...entry.reasoning }
        : existing?.reasoning,
      customHeaders: entry.customHeaders
        ? { ...(existing?.customHeaders ?? {}), ...entry.customHeaders }
        : existing?.customHeaders,
      aws: entry.aws
        ? { ...(existing?.aws ?? {}), ...entry.aws }
        : existing?.aws,
      updatedAt: Date.now(),
    };

    settings.providers[providerId] = merged;
    await this.writeSettings(settings);
    return merged;
  }

  public async removeProvider(providerId: string): Promise<boolean> {
    const settings = await this.readSettings();
    if (providerId in settings.providers) {
      delete settings.providers[providerId];
      if (settings.activeProviderId === providerId) {
        settings.activeProviderId = undefined;
      }
      await this.writeSettings(settings);
      return true;
    }
    return false;
  }

  public async getActiveProviderId(): Promise<string | undefined> {
    const settings = await this.readSettings();
    return settings.activeProviderId;
  }

  public async setActiveProviderId(providerId: string | undefined): Promise<void> {
    const settings = await this.readSettings();
    settings.activeProviderId = providerId;
    await this.writeSettings(settings);
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public clearCache(): void {
    this.inMemoryCache = null;
  }
}
