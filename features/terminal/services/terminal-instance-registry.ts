import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { TerminalSettings } from "../types";
import { TerminalThemeService } from "./terminal-theme.service";
import { TerminalIpcService } from "./terminal-ipc.service";
import { TerminalLinkProvider } from "./terminal-link-provider";
import { DevServerDetector } from "./dev-server-detector";
import { UnlistenFn } from "@tauri-apps/api/event";
import { openExternalUrl } from "@/lib/tauri-ipc";

export interface TerminalInstance {
  sessionId: string;
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  webLinksAddon: WebLinksAddon;
  unicode11Addon: Unicode11Addon;
  webglAddon?: WebglAddon;
  container: HTMLElement | null;
  unlistenData?: UnlistenFn;
  unlistenExit?: UnlistenFn;
  disposed: boolean;
}

export class TerminalInstanceRegistry {
  private static instances = new Map<string, TerminalInstance>();

  static get(sessionId: string): TerminalInstance | undefined {
    return this.instances.get(sessionId);
  }

  static has(sessionId: string): boolean {
    return this.instances.has(sessionId);
  }

  static createOrGet(
    sessionId: string,
    settings: TerminalSettings,
    currentTheme: string,
    onExitCallback?: (code: number | null) => void
  ): TerminalInstance {
    const existing = this.instances.get(sessionId);
    if (existing && !existing.disposed) {
      return existing;
    }

    const term = new Terminal({
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: settings.lineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      theme: TerminalThemeService.getTheme(currentTheme),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    // Custom link opener using Tauri desktop native URL opener and browser fallback
    const handleOpenUri = (event: MouseEvent, uri: string) => {
      event.preventDefault();
      event.stopPropagation();
      let finalUri = uri.trim();
      if (/^(localhost|127\.0\.0\.1)(:\d+)?/i.test(finalUri)) {
        finalUri = `http://${finalUri}`;
      }
      openExternalUrl(finalUri).catch((err) => {
        console.error("[TerminalInstanceRegistry] Failed to open link:", err);
      });
    };
    const webLinksAddon = new WebLinksAddon(handleOpenUri);
    const unicode11Addon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = "11";

    // Register custom clickable file path link provider
    const linkProvider = new TerminalLinkProvider(term);
    term.registerLinkProvider(linkProvider);

    // Forward user keystrokes directly to Rust PTY
    term.onData((data) => {
      if (!instance.disposed) {
        TerminalIpcService.writeSession(sessionId, data).catch((err) => {
          if (!instance.disposed) {
            console.error(`[TerminalRegistry] Failed to write data for session ${sessionId}:`, err);
          }
        });
      }
    });

    const instance: TerminalInstance = {
      sessionId,
      term,
      fitAddon,
      searchAddon,
      webLinksAddon,
      unicode11Addon,
      container: null,
      disposed: false,
    };

    // Try optional WebGL acceleration with graceful DOM fallback
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
      instance.webglAddon = webglAddon;
    } catch {
      // Graceful fallback to default canvas/DOM renderer
    }

    // Subscribe directly to backend stdout stream (Zero React state buffering)
    TerminalIpcService.subscribeOutput(sessionId, (chunk) => {
      if (!instance.disposed) {
        try {
          term.write(chunk);
          DevServerDetector.scanOutput(sessionId, chunk);
        } catch {
          // Terminal may be disposing
        }
      }
    })
      .then((unlisten) => {
        if (instance.disposed) {
          try {
            unlisten();
          } catch {
            // ignore
          }
        } else {
          instance.unlistenData = unlisten;
        }
      })
      .catch((err) => {
        if (!instance.disposed) {
          console.error(`[TerminalRegistry] Failed to subscribe to output for session ${sessionId}:`, err);
        }
      });

    // Subscribe to backend exit event
    TerminalIpcService.subscribeExit(sessionId, (exitPayload) => {
      if (!instance.disposed) {
        try {
          term.writeln(`\r\n\x1b[90m[Process exited with code ${exitPayload.code ?? "unknown"}]\x1b[0m\r\n`);
        } catch {
          // Terminal may be disposing
        }
        onExitCallback?.(exitPayload.code);
      }
    })
      .then((unlisten) => {
        if (instance.disposed) {
          try {
            unlisten();
          } catch {
            // ignore
          }
        } else {
          instance.unlistenExit = unlisten;
        }
      })
      .catch((err) => {
        if (!instance.disposed) {
          console.error(`[TerminalRegistry] Failed to subscribe to exit for session ${sessionId}:`, err);
        }
      });

    this.instances.set(sessionId, instance);
    return instance;
  }

  static attach(sessionId: string, container: HTMLElement): void {
    const instance = this.instances.get(sessionId);
    if (!instance || instance.disposed) return;

    if (instance.container !== container) {
      instance.container = container;
      try {
        if (!container.contains(instance.term.element || null)) {
          container.innerHTML = "";
          if (instance.term.element) {
            container.appendChild(instance.term.element);
          } else {
            instance.term.open(container);
          }
        }
      } catch {
        // Container or DOM might not be fully available in testing or SSR
      }
      try {
        instance.fitAddon.fit();
      } catch {
        // container not fully measured yet
      }
      try {
        instance.term.focus();
      } catch {
        // terminal not focused
      }
    }
  }

  static applyTheme(sessionId: string, theme: string): void {
    const instance = this.instances.get(sessionId);
    if (instance && !instance.disposed) {
      instance.term.options.theme = TerminalThemeService.getTheme(theme);
    }
  }

  static applySettings(sessionId: string, settings: TerminalSettings): void {
    const instance = this.instances.get(sessionId);
    if (!instance || instance.disposed) return;

    let needsFit = false;
    if (instance.term.options.fontSize !== settings.fontSize) {
      instance.term.options.fontSize = settings.fontSize;
      needsFit = true;
    }
    if (instance.term.options.fontFamily !== settings.fontFamily) {
      instance.term.options.fontFamily = settings.fontFamily;
      needsFit = true;
    }
    if (instance.term.options.lineHeight !== settings.lineHeight) {
      instance.term.options.lineHeight = settings.lineHeight;
      needsFit = true;
    }
    if (instance.term.options.fontWeight !== settings.fontWeight) {
      instance.term.options.fontWeight = settings.fontWeight;
    }
    if (instance.term.options.cursorStyle !== settings.cursorStyle) {
      instance.term.options.cursorStyle = settings.cursorStyle;
    }
    if (instance.term.options.cursorBlink !== settings.cursorBlink) {
      instance.term.options.cursorBlink = settings.cursorBlink;
    }
    if (instance.term.options.scrollback !== settings.scrollback) {
      instance.term.options.scrollback = settings.scrollback;
    }

    if (needsFit) {
      try {
        instance.fitAddon.fit();
      } catch {
        // Container may not be fully measured yet
      }
    }
  }

  static applyAllThemes(theme: string): void {
    for (const instance of this.instances.values()) {
      if (!instance.disposed) {
        instance.term.options.theme = TerminalThemeService.getTheme(theme);
      }
    }
  }

  static fit(sessionId: string): { cols: number; rows: number } | null {
    const instance = this.instances.get(sessionId);
    if (!instance || instance.disposed || !instance.container) return null;

    try {
      instance.fitAddon.fit();
      return { cols: instance.term.cols, rows: instance.term.rows };
    } catch {
      return null;
    }
  }

  static focus(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (instance && !instance.disposed) {
      try {
        instance.term.focus();
      } catch {
        // terminal not ready yet
      }
    }
  }

  static detach(sessionId: string, container?: HTMLElement | null): void {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    if (!container || instance.container === container) {
      instance.container = null;
    }
  }

  static dispose(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (!instance) return;

    instance.disposed = true;
    DevServerDetector.clearSession(sessionId);
    if (instance.unlistenData) {
      try {
        instance.unlistenData();
      } catch {
        // ignore
      }
      instance.unlistenData = undefined;
    }
    if (instance.unlistenExit) {
      try {
        instance.unlistenExit();
      } catch {
        // ignore
      }
      instance.unlistenExit = undefined;
    }

    try {
      instance.fitAddon.dispose();
    } catch {
      // ignore
    }
    try {
      instance.searchAddon.dispose();
    } catch {
      // ignore
    }
    try {
      instance.webLinksAddon.dispose();
    } catch {
      // ignore
    }
    try {
      instance.unicode11Addon.dispose();
    } catch {
      // ignore
    }
    if (instance.webglAddon) {
      try {
        instance.webglAddon.dispose();
      } catch {
        // ignore
      }
    }
    try {
      instance.term.dispose();
    } catch {
      // ignore
    }

    this.instances.delete(sessionId);
  }

  static disposeAll(): void {
    for (const sessionId of Array.from(this.instances.keys())) {
      this.dispose(sessionId);
    }
  }
}
