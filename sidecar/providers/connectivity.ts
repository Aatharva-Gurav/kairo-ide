import type { ProviderConnectivityResult } from "./types";
import { Logger } from "../utils/logger";

export interface ProbeOptions {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class ProviderConnectivityTester {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? new Logger("sidecar")).child("connectivity-tester");
  }

  public async testConnectivity(options: ProbeOptions): Promise<ProviderConnectivityResult> {
    const { providerId, apiKey, customHeaders, timeoutMs = 10000 } = options;
    const startTime = Date.now();

    try {
      const { url, headers, method, body } = this.resolveProbeRequest(options);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          ...(customHeaders ?? {}),
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          ok: true,
          providerId,
          latencyMs,
          modelVerified: true,
        };
      }

      // Handle specific HTTP error status codes
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          providerId,
          latencyMs,
          error: `Authentication failed (HTTP ${response.status}): Provider rejected the credentials.`,
        };
      }

      if (response.status === 404) {
        // Some providers may not support /models or specific endpoint, but are reachable
        return {
          ok: true,
          providerId,
          latencyMs,
          modelVerified: false,
          details: `Endpoint reached but returned 404 for model check.`,
        };
      }

      const text = await response.text().catch(() => "");
      return {
        ok: false,
        providerId,
        latencyMs,
        error: `Provider returned HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const error = err as Error;

      if (error.name === "AbortError") {
        return {
          ok: false,
          providerId,
          latencyMs,
          error: `Connection timed out after ${timeoutMs}ms`,
        };
      }

      return {
        ok: false,
        providerId,
        latencyMs,
        error: `Network error: ${error.message}`,
      };
    }
  }

  private resolveProbeRequest(options: ProbeOptions): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const { providerId, apiKey, baseUrl } = options;

    switch (providerId) {
      case "anthropic": {
        const base = baseUrl || "https://api.anthropic.com/v1";
        return {
          url: `${base}/models`,
          method: "GET",
          headers: {
            "x-api-key": apiKey || "",
            "anthropic-version": "2023-06-01",
          },
        };
      }

      case "gemini": {
        const base = baseUrl || "https://generativelanguage.googleapis.com/v1beta";
        const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
        return {
          url: `${base}/models${keyParam}`,
          method: "GET",
          headers: {},
        };
      }

      case "ollama": {
        const base = baseUrl || "http://localhost:11434";
        return {
          url: `${base}/api/tags`,
          method: "GET",
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        };
      }

      case "openrouter": {
        const base = baseUrl || "https://openrouter.ai/api/v1";
        return {
          url: `${base}/models`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey || ""}`,
          },
        };
      }

      case "mistral": {
        const base = baseUrl || "https://api.mistral.ai/v1";
        return {
          url: `${base}/models`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey || ""}`,
          },
        };
      }

      case "openai-native":
      case "openai-compatible":
      case "deepseek":
      case "groq":
      case "lmstudio":
      default: {
        const base = baseUrl || "https://api.openai.com/v1";
        return {
          url: `${base}/models`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey || ""}`,
          },
        };
      }
    }
  }
}
