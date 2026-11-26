import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import { TerminalIpcService } from "./terminal-ipc.service";

describe("TerminalIpcService", () => {
  it("provides fallback mock shells in browser environment", async () => {
    const shells = await TerminalIpcService.detectShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(shells[0].id).toBeDefined();
    expect(shells[0].name).toBeDefined();
  });

  it("creates mock session in browser environment", async () => {
    const session = await TerminalIpcService.createSession();
    expect(session.sessionId).toBeDefined();
    expect(session.status).toBe("running");
  });

  it("handles write and mock events when window is available", async () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const mockWindow = {
      addEventListener: (event: string, handler: (e: unknown) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: (e: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
      dispatchEvent: (event: { type: string; detail: unknown }) => {
        const list = listeners[event.type] || [];
        for (const fn of list) {
          fn(event);
        }
        return true;
      },
    };

    (global as unknown as { window?: unknown }).window = mockWindow;

    const session = await TerminalIpcService.createSession();
    const dataChunks: string[] = [];

    const unlisten = await TerminalIpcService.subscribeOutput(
      session.sessionId,
      (chunk) => {
        dataChunks.push(chunk);
      }
    );

    await TerminalIpcService.writeSession(session.sessionId, "echo test\r\n");
    expect(dataChunks).toContain("echo test\r\n");

    unlisten();
    delete (global as unknown as { window?: unknown }).window;
  });

  it("handles killAll cleanly without errors in browser environment", async () => {
    await expect(TerminalIpcService.killAll()).resolves.not.toThrow();
  });

  it("handles killWorkspaceSessions cleanly without errors in browser environment", async () => {
    await expect(TerminalIpcService.killWorkspaceSessions("ws_test")).resolves.not.toThrow();
  });

  describe("Tauri Mode Terminal IPC & Custom Profile Sync (SEC-04 / SEC-08)", () => {
    const globalWithWindow = globalThis as unknown as { window?: unknown };
    let originalWindow: unknown;

    beforeEach(() => {
      originalWindow = globalWithWindow.window;
      globalWithWindow.window = { __TAURI_INTERNALS__: {} };
      mockInvoke.mockReset();
    });

    afterEach(() => {
      if (originalWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = originalWindow;
      }
    });

    it("syncs custom profiles with terminal_sync_custom_profiles and propagates backend errors", async () => {
      const profiles = [
        {
          id: "custom-pwsh",
          name: "Custom PowerShell",
          executable: "pwsh.exe",
          icon: "terminal",
          isDefault: false,
          isCustom: true,
          platform: "win32",
        },
      ];
      mockInvoke.mockResolvedValueOnce(profiles);

      const synced = await TerminalIpcService.syncCustomProfiles(profiles);
      expect(mockInvoke).toHaveBeenCalledWith("terminal_sync_custom_profiles", { profiles });
      expect(synced).toEqual(profiles);

      mockInvoke.mockRejectedValueOnce(new Error("Unauthorized executable"));
      await expect(TerminalIpcService.syncCustomProfiles(profiles)).rejects.toThrow(
        "Unauthorized executable"
      );
    });

    it("propagates native terminal_create failures without falling back to browser mock", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Direct executable overrides are not permitted"));

      await expect(
        TerminalIpcService.createSession({ executable: "python.exe" })
      ).rejects.toThrow("Direct executable overrides are not permitted");
    });
  });
});
