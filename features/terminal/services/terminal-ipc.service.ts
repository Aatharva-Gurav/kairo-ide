import { isTauriEnvironment } from "@/lib/tauri-ipc";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  ShellProfile,
  TerminalCreateConfig,
  TerminalExitPayload,
  TerminalSessionInfo,
} from "../types";

export class TerminalIpcService {
  /**
   * Queries the backend for available shell profiles installed on the host OS.
   */
  static async detectShells(): Promise<ShellProfile[]> {
    if (isTauriEnvironment()) {
      return await invoke<ShellProfile[]>("terminal_detect_shells");
    }

    // Browser development fallback
    return [
      {
        id: "browser-mock",
        name: "Browser Mock Shell",
        executable: "mock-sh",
        args: [],
        icon: "terminal",
        isDefault: true,
        platform: "browser",
      },
    ];
  }

  /**
   * Spawns a new PTY session in the Rust backend.
   */
  static async createSession(
    config?: TerminalCreateConfig
  ): Promise<TerminalSessionInfo> {
    if (isTauriEnvironment()) {
      return await invoke<TerminalSessionInfo>("terminal_create", { config });
    }

    // Browser development fallback
    const mockId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      sessionId: mockId,
      pid: 1234,
      shell: "mock-sh",
      args: [],
      cwd: "/workspace",
      cols: config?.cols ?? 80,
      rows: config?.rows ?? 24,
      status: "running",
      createdAt: Date.now(),
    };
  }

  /**
   * Forwards keyboard input or pasted text to the PTY master.
   */
  static async writeSession(sessionId: string, data: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke<void>("terminal_write", { sessionId, data });
      return;
    }

    // Mock echo in browser mode
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(`mock-terminal:data:${sessionId}`, { detail: data })
      );
    }
  }

  /**
   * Updates physical PTY dimensions (columns and rows) in the kernel.
   */
  static async resizeSession(
    sessionId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke<void>("terminal_resize", { sessionId, cols, rows });
    }
  }

  /**
   * Forcefully kills a terminal session and its process tree.
   */
  static async killSession(sessionId: string): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke<void>("terminal_kill", { sessionId });
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(`mock-terminal:exit:${sessionId}`, {
          detail: { sessionId, code: 0 },
        })
      );
    }
  }

  /**
   * Retrieves all running terminal sessions.
   */
  static async listSessions(): Promise<TerminalSessionInfo[]> {
    if (isTauriEnvironment()) {
      return await invoke<TerminalSessionInfo[]>("terminal_list_sessions");
    }
    return [];
  }

  /**
   * Subscribes to real-time stdout/stderr output chunks from the PTY reader thread.
   */
  static async subscribeOutput(
    sessionId: string,
    onData: (data: string) => void
  ): Promise<UnlistenFn> {
    if (isTauriEnvironment()) {
      return await listen<string>(`terminal:data:${sessionId}`, (event) => {
        onData(event.payload);
      });
    }

    // Browser mock event listener
    if (typeof window !== "undefined") {
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent<string>;
        onData(customEvent.detail);
      };

      const eventName = `mock-terminal:data:${sessionId}`;
      window.addEventListener(eventName, handler);
      return () => {
        window.removeEventListener(eventName, handler);
      };
    }

    return () => {};
  }

  /**
   * Subscribes to session termination notifications (with exit status code).
   */
  static async subscribeExit(
    sessionId: string,
    onExit: (payload: TerminalExitPayload) => void
  ): Promise<UnlistenFn> {
    if (isTauriEnvironment()) {
      return await listen<TerminalExitPayload>(
        `terminal:exit:${sessionId}`,
        (event) => {
          onExit(event.payload);
        }
      );
    }

    // Browser mock exit listener
    if (typeof window !== "undefined") {
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent<TerminalExitPayload>;
        onExit(customEvent.detail);
      };

      const eventName = `mock-terminal:exit:${sessionId}`;
      window.addEventListener(eventName, handler);
      return () => {
        window.removeEventListener(eventName, handler);
      };
    }

    return () => {};
  }
}
