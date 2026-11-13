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
    const webLinksAddon = new WebLinksAddon();
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
      TerminalIpcService.writeSession(sessionId, data).catch((err) => {
        console.error(`[TerminalRegistry] Failed to write data for session ${sessionId}:`, err);
      });
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
        term.write(chunk);
        DevServerDetector.scanOutput(sessionId, chunk);
      }
    })
      .then((unlisten) => {
        instance.unlistenData = unlisten;
      })
      .catch((err) => {
        console.error(`[TerminalRegistry] Failed to subscribe to output for session ${sessionId}:`, err);
      });

    // Subscribe to backend exit event
    TerminalIpcService.subscribeExit(sessionId, (exitPayload) => {
      if (!instance.disposed) {
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitPayload.code ?? "unknown"}]\x1b[0m\r\n`);
        onExitCallback?.(exitPayload.code);
      }
    })
      .then((unlisten) => {
        instance.unlistenExit = unlisten;
      })
      .catch((err) => {
        console.error(`[TerminalRegistry] Failed to subscribe to exit for session ${sessionId}:`, err);
      });

    this.instances.set(sessionId, instance);
    return instance;
  }

  static attach(sessionId: string, container: HTMLElement): void {
    const instance = this.instances.get(sessionId);
    if (!instance || instance.disposed) return;

    if (instance.container !== container) {
      instance.container = container;
      if (!container.contains(instance.term.element || null)) {
        container.innerHTML = "";
        instance.term.open(container);
      }
      try {
        instance.fitAddon.fit();
      } catch {
        // container not fully measured yet
      }
      instance.term.focus();
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

  static dispose(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (!instance) return;

    instance.disposed = true;
    DevServerDetector.clearSession(sessionId);
    if (instance.unlistenData) instance.unlistenData();
    if (instance.unlistenExit) instance.unlistenExit();
    instance.fitAddon.dispose();
    instance.searchAddon.dispose();
    instance.webLinksAddon.dispose();
    instance.unicode11Addon.dispose();
    if (instance.webglAddon) instance.webglAddon.dispose();
    instance.term.dispose();

    this.instances.delete(sessionId);
  }

  static disposeAll(): void {
    for (const sessionId of Array.from(this.instances.keys())) {
      this.dispose(sessionId);
    }
  }
}
