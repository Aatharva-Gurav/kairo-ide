export interface DetectedDevServer {
  url: string;
  port: number;
  protocol: "http" | "https";
  detectedAt: number;
  sessionId: string;
}

export type DevServerListener = (server: DetectedDevServer) => void;

const DEV_SERVER_REGEX =
  /(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})([/a-zA-Z0-9_.~!*'();:@&=+$,%#-]*)/gi;

export class DevServerDetector {
  private static detectedServers = new Map<string, DetectedDevServer[]>();
  private static listeners = new Set<DevServerListener>();

  /**
   * Scans an incoming output chunk for local development server URLs.
   */
  static scanOutput(sessionId: string, text: string): DetectedDevServer[] {
    const servers: DetectedDevServer[] = [];
    let match: RegExpExecArray | null;

    DEV_SERVER_REGEX.lastIndex = 0;
    while ((match = DEV_SERVER_REGEX.exec(text)) !== null) {
      const protocol = match[1].startsWith("https") ? "https" : "http";
      const host = match[2];
      const port = parseInt(match[3], 10);
      const pathname = match[4] || "";

      // Validate standard port range
      if (port >= 80 && port <= 65535) {
        const canonicalUrl = `${protocol}://${host === "0.0.0.0" ? "localhost" : host}:${port}${pathname}`;

        const server: DetectedDevServer = {
          url: canonicalUrl,
          port,
          protocol,
          detectedAt: Date.now(),
          sessionId,
        };

        const existing = this.detectedServers.get(sessionId) || [];
        if (!existing.some((s) => s.port === port && s.protocol === protocol)) {
          existing.push(server);
          this.detectedServers.set(sessionId, existing);
          servers.push(server);
          this.notifyListeners(server);
        }
      }
    }

    return servers;
  }

  static getServers(sessionId: string): DetectedDevServer[] {
    return this.detectedServers.get(sessionId) || [];
  }

  static getAllServers(): DetectedDevServer[] {
    const all: DetectedDevServer[] = [];
    for (const list of this.detectedServers.values()) {
      all.push(...list);
    }
    return all;
  }

  static clearSession(sessionId: string): void {
    this.detectedServers.delete(sessionId);
  }

  static subscribe(listener: DevServerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners(server: DetectedDevServer): void {
    this.listeners.forEach((listener) => {
      try {
        listener(server);
      } catch (err) {
        console.error("[DevServerDetector] Listener error:", err);
      }
    });
  }
}
